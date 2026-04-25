"use client";

import { useState } from "react";
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
import { deriveEscrowPda } from "@/lib/solana/program";
import { DEFAULT_MILESTONE_BPS } from "@/lib/constants";
import type { Trade } from "@/types";

function useSigningWallet() {
  const { wallets } = useWallets();
  const wallet = wallets[0];

  if (!wallet?.address) return null;

  return {
    publicKey: new PublicKey(wallet.address),
    signTransaction: async (tx: unknown) => wallet.signTransaction(tx as never),
    signAllTransactions: async (txs: unknown[]) =>
      Promise.all(txs.map((tx) => wallet.signTransaction(tx as never))),
  };
}

export function useEscrow() {
  const [loading, setLoading] = useState(false);
  const signingWallet = useSigningWallet();

  /**
   * Initialize + fund the escrow in one flow.
   * Called when buyer clicks "Fund Escrow" on the trade detail page.
   * Returns { initTx, fundTx, escrowPubkey } or throws.
   */
  async function handleFundEscrow(trade: Trade): Promise<{
    initTx: string;
    fundTx: string;
    escrowPubkey: string;
  }> {
    if (!signingWallet) throw new Error("No wallet connected");
    if (!trade.supplier?.wallet_address)
      throw new Error("Supplier wallet not found");

    setLoading(true);
    const toastId = toast.loading("Initializing escrow on Solana...");

    try {
      const milestoneBps = trade.milestones?.map(
        (m) => m.release_percentage * 100
      ) ?? DEFAULT_MILESTONE_BPS;

      // Step 1 — create the on-chain escrow account
      const initTx = await initializeEscrow({
        wallet: signingWallet,
        tradeId: trade.id,
        supplierWallet: trade.supplier.wallet_address,
        totalAmountUsdc: Number(trade.total_amount_usdc),
        milestoneBps,
      });

      toast.loading("Depositing USDC into escrow...", { id: toastId });

      // Step 2 — deposit USDC
      const fundTx = await fundEscrow({
        wallet: signingWallet,
        tradeId: trade.id,
        totalAmountUsdc: Number(trade.total_amount_usdc),
      });

      const [escrowPda] = deriveEscrowPda(trade.id);
      const escrowPubkey = escrowPda.toBase58();

      toast.success("Escrow funded successfully!", { id: toastId });

      return { initTx, fundTx, escrowPubkey };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Release a milestone payment to the supplier.
   * In MVP: buyer approves → API calls this with the arbiter wallet server-side.
   * For demo: buyer wallet acts as arbiter.
   */
  async function handleReleaseMilestone(
    trade: Trade,
    milestoneIndex: number
  ): Promise<string> {
    if (!signingWallet) throw new Error("No wallet connected");
    if (!trade.supplier?.wallet_address)
      throw new Error("Supplier wallet not found");

    setLoading(true);
    const toastId = toast.loading(
      `Releasing milestone ${milestoneIndex + 1}...`
    );

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
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Raise a dispute — freezes the escrow on-chain
   */
  async function handleRaiseDispute(
    trade: Trade,
    milestoneIndex: number,
    reason: string
  ): Promise<string> {
    if (!signingWallet) throw new Error("No wallet connected");

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
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Refund — cancels the trade and returns USDC to buyer
   */
  async function handleRefund(trade: Trade): Promise<string> {
    if (!signingWallet) throw new Error("No wallet connected");

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
      toast.error(msg, { id: toastId });
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    handleFundEscrow,
    handleReleaseMilestone,
    handleRaiseDispute,
    handleRefund,
    fetchEscrowAccount,
  };
}
