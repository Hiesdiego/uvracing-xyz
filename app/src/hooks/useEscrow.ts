"use client";

import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import {
  initializeEscrow,
  fundEscrow,
  releaseMilestone,
  raiseDispute,
  refundEscrow,
  fetchEscrowAccount,
} from "@/lib/solana/escrow";
import { deriveEscrowPda, getConnection } from "@/lib/solana/program";
import { DEFAULT_MILESTONE_BPS } from "@/lib/constants";
import type { Trade } from "@/types";

// ---------------------------------------------------------------------------
// PrivyWallet type helper
// walletClientType is present on Privy wallet objects but not in the public
// type definition, so we extend it.
// ---------------------------------------------------------------------------
type PrivyWalletExtra = {
  address: string;
  walletClientType?: string;
  connectorType?: string;
  signTransaction: (tx: unknown) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// useEmbeddedWallet
//
// THE FIX for "wallet never loads":
//
// The old code used `wallets[0]` from useWallets(). This is wrong for two
// reasons:
//
// 1. When shouldAutoConnect was true (old PrivyProvider), any previously-
//    connected external wallet (Phantom, Backpack…) auto-reconnected on page
//    load and landed at wallets[0], displacing the embedded wallet. The buyer
//    then signed with Phantom — which holds no USDC — and the tx failed
//    silently.
//
// 2. Even with shouldAutoConnect: false (our PrivyProvider fix), wallet order
//    in the array is not guaranteed to put the embedded wallet first.
//
// The fix: ALWAYS explicitly find the wallet whose walletClientType === "privy"
// (that's the embedded wallet). Only fall back to wallets[0] if no embedded
// wallet exists (i.e. user connected an external wallet for login).
//
// We also poll until ready so callers don't need to handle the async delay.
// ---------------------------------------------------------------------------
function useEmbeddedWallet() {
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const [walletReady, setWalletReady] = useState(false);
  const [resolvedWallet, setResolvedWallet] = useState<PrivyWalletExtra | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!ready) {
      setWalletReady(false);
      setResolvedWallet(null);
      return;
    }

    function resolve() {
      const allWallets = wallets as unknown as PrivyWalletExtra[];

      if (process.env.NODE_ENV === "development") {
        console.group("[useEmbeddedWallet] wallet resolution");
        console.log(
          "All wallets:",
          allWallets.map((w) => ({
            address: w.address,
            type: w.walletClientType,
            connector: w.connectorType,
          }))
        );
      }

      // Prefer the Privy embedded wallet
      const embedded = allWallets.find((w) => w.walletClientType === "privy");

      // Fallback: any wallet with an address (external sign-in wallet)
      const fallback = allWallets.find((w) => w.address);

      const chosen = embedded ?? fallback ?? null;

      if (process.env.NODE_ENV === "development") {
        console.log("chosen:", chosen ? { address: chosen.address, type: chosen.walletClientType } : null);
        console.groupEnd();
      }

      if (chosen?.address) {
        setResolvedWallet(chosen);
        setWalletReady(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        setWalletReady(false);
        setResolvedWallet(null);
      }
    }

    resolve();

    // If no wallet found yet (still provisioning), poll every 500ms for up to 10s
    if (!resolvedWallet) {
      pollRef.current = setInterval(resolve, 500);
      const timeout = setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (!resolvedWallet) {
          console.warn(
            "[useEmbeddedWallet] Timed out waiting for wallet after 10s. " +
              "User may need to refresh the page."
          );
        }
      }, 10_000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        clearTimeout(timeout);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wallets]);

  const signingWallet = resolvedWallet
    ? {
        publicKey: new PublicKey(resolvedWallet.address),
        signTransaction: async (tx: unknown) =>
          resolvedWallet.signTransaction(tx),
        signAllTransactions: async (txs: unknown[]) =>
          Promise.all(txs.map((tx) => resolvedWallet.signTransaction(tx))),
      }
    : null;

  return { signingWallet, walletReady, walletAddress: resolvedWallet?.address ?? null };
}

// ---------------------------------------------------------------------------
// milestoneBps builder + validator
// ---------------------------------------------------------------------------
function buildMilestoneBps(milestones: Trade["milestones"]): number[] {
  if (!milestones || milestones.length === 0) {
    console.warn("[useEscrow] No milestones on trade — using DEFAULT_MILESTONE_BPS:", DEFAULT_MILESTONE_BPS);
    return DEFAULT_MILESTONE_BPS;
  }

  const bps = milestones.map((m) => {
    const pct = Number(m.release_percentage);
    // Detect decimal format (0 < x ≤ 1) vs integer percentage (e.g. 30)
    return pct > 0 && pct <= 1
      ? Math.round(pct * 10_000)
      : Math.round(pct * 100);
  });

  const sum = bps.reduce((a, b) => a + b, 0);

  if (sum !== 10_000) {
    throw new Error(
      `Milestone BPS must sum to 10 000, got ${sum}. ` +
        `Values: [${bps.join(", ")}]. ` +
        `Ensure release_percentage is stored as integers (e.g. 30, not 0.3).`
    );
  }

  console.log("[useEscrow] milestoneBps validated:", bps, "sum:", sum);
  return bps;
}

// ---------------------------------------------------------------------------
// useEscrow
// ---------------------------------------------------------------------------
export function useEscrow() {
  const [loading, setLoading] = useState(false);
  const { signingWallet, walletReady, walletAddress } = useEmbeddedWallet();

  // -------------------------------------------------------------------------
  // handleFundEscrow
  // -------------------------------------------------------------------------
  async function handleFundEscrow(trade: Trade): Promise<{
    initTx: string | null;
    fundTx: string;
    escrowPubkey: string;
  }> {
    if (!walletReady || !signingWallet) {
      const msg = "Wallet is not ready. Please wait a moment and try again, or refresh the page.";
      toast.error(msg);
      throw new Error(msg);
    }

    if (!trade.supplier?.wallet_address)
      throw new Error("Supplier wallet not found on trade");

    // Validate BPS before any chain interaction
    const milestoneBps = buildMilestoneBps(trade.milestones);

    console.log("[useEscrow] handleFundEscrow start", {
      tradeId: trade.id,
      buyerWallet: walletAddress,
      supplierWallet: trade.supplier.wallet_address,
      totalUsdc: trade.total_amount_usdc,
      milestoneBps,
    });

    setLoading(true);
    const toastId = toast.loading("Preparing escrow on Solana...");

    try {
      const connection = getConnection();
      const [escrowPda] = deriveEscrowPda(trade.id);
      const escrowPubkey = escrowPda.toBase58();

      console.log("[useEscrow] escrow PDA:", escrowPubkey);

      // Idempotency: skip initializeEscrow if account already exists
      const existingAccount = await connection.getAccountInfo(escrowPda);
      console.log("[useEscrow] escrow exists on-chain:", !!existingAccount);

      let initTx: string | null = null;

      if (existingAccount) {
        toast.loading("Escrow found — depositing USDC...", { id: toastId });
      } else {
        toast.loading("Initializing escrow on Solana...", { id: toastId });
        initTx = await initializeEscrow({
          wallet: signingWallet,
          tradeId: trade.id,
          supplierWallet: trade.supplier.wallet_address,
          totalAmountUsdc: Number(trade.total_amount_usdc),
          milestoneBps,
        });
        console.log("[useEscrow] initializeEscrow tx:", initTx);
        toast.loading("Depositing USDC into escrow...", { id: toastId });
      }

      const fundTx = await fundEscrow({
        wallet: signingWallet,
        tradeId: trade.id,
        totalAmountUsdc: Number(trade.total_amount_usdc),
      });
      console.log("[useEscrow] fundEscrow tx:", fundTx);

      toast.success("Escrow funded successfully!", { id: toastId });
      return { initTx, fundTx, escrowPubkey };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      console.error("[useEscrow] handleFundEscrow error:", err);
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // handleReleaseMilestone
  // -------------------------------------------------------------------------
  async function handleReleaseMilestone(
    trade: Trade,
    milestoneIndex: number
  ): Promise<string> {
    if (!walletReady || !signingWallet)
      throw new Error("No Solana wallet connected");
    if (!trade.supplier?.wallet_address)
      throw new Error("Supplier wallet not found");

    setLoading(true);
    const toastId = toast.loading(`Releasing milestone ${milestoneIndex + 1}...`);

    try {
      const tx = await releaseMilestone({
        wallet: signingWallet,
        tradeId: trade.id,
        milestoneIndex,
        supplierWallet: trade.supplier.wallet_address,
      });
      toast.success("Milestone released!", { id: toastId });
      return tx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Release failed";
      console.error("[useEscrow] handleReleaseMilestone error:", err);
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // handleRaiseDispute
  // -------------------------------------------------------------------------
  async function handleRaiseDispute(
    trade: Trade,
    milestoneIndex: number,
    reason: string
  ): Promise<string> {
    if (!walletReady || !signingWallet)
      throw new Error("No Solana wallet connected");

    setLoading(true);
    const toastId = toast.loading("Raising dispute...");

    try {
      const tx = await raiseDispute({
        wallet: signingWallet,
        tradeId: trade.id,
        milestoneIndex,
        reason,
      });
      toast.success("Dispute raised. Escrow frozen.", { id: toastId });
      return tx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dispute failed";
      console.error("[useEscrow] handleRaiseDispute error:", err);
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // handleRefund
  // -------------------------------------------------------------------------
  async function handleRefund(trade: Trade): Promise<string> {
    if (!walletReady || !signingWallet)
      throw new Error("No Solana wallet connected");

    setLoading(true);
    const toastId = toast.loading("Processing refund...");

    try {
      const tx = await refundEscrow({
        wallet: signingWallet,
        tradeId: trade.id,
      });
      toast.success("Refund complete. USDC returned.", { id: toastId });
      return tx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refund failed";
      console.error("[useEscrow] handleRefund error:", err);
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    walletReady,
    walletAddress,
    handleFundEscrow,
    handleReleaseMilestone,
    handleRaiseDispute,
    handleRefund,
    fetchEscrowAccount,
  };
}