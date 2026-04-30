"use client";

import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
import { DEFAULT_MILESTONE_BPS, RPC_URL } from "@/lib/constants";
import { anchorProofHashOnChain } from "@/lib/solana/witness";
import type { Trade } from "@/types";

const MIN_SOL_FOR_ESCROW_TXS = 0.001;

// ---------------------------------------------------------------------------
// PrivyWallet type helper
// ---------------------------------------------------------------------------
type PrivyWalletExtra = {
  address: string;
  walletClientType?: string;
  connectorType?: string;
  meta?: { id?: string; name?: string };
  isConnected?: () => Promise<boolean>;
  features?: Record<string, unknown>;
  standardWallet?: {
    name?: string;
    isPrivyWallet?: boolean;
  };
  signTransaction: (tx: unknown) => Promise<unknown>;
  sendTransaction?: (tx: unknown) => Promise<unknown>;
};

async function ensureWalletConnected(wallet: PrivyWalletExtra) {
  try {
    const connected = await wallet.isConnected?.();
    if (connected) return;

    const connectFeature = (
      wallet.features?.["standard:connect"] as
        | { connect?: () => Promise<unknown> }
        | undefined
    )?.connect;

    if (connectFeature) {
      await connectFeature();
    }
  } catch (err) {
    console.warn("[useEscrow] wallet connect preflight failed", {
      message: err instanceof Error ? err.message : String(err),
      walletClientType: wallet.walletClientType,
      connectorType: wallet.connectorType,
      metaId: wallet.meta?.id,
      metaName: wallet.meta?.name,
    });
  }
}
function toNativeUint8Array(input: unknown): Uint8Array | null {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return null;
}

function extractSignatureFromSendResult(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return null;
  if ("signature" in result && typeof (result as { signature?: unknown }).signature === "string") {
    return (result as { signature: string }).signature;
  }
  if ("signatures" in result) {
    const signatures = (result as { signatures?: unknown }).signatures;
    if (Array.isArray(signatures) && typeof signatures[0] === "string") {
      return signatures[0];
    }
  }
  return null;
}

function trySerializeTransaction(input: unknown): Uint8Array | null {
  if (!input || typeof input !== "object") return null;
  const serialize = (input as { serialize?: (...args: unknown[]) => unknown }).serialize;
  if (typeof serialize !== "function") return null;

  try {
    const maybeLegacy = serialize.call(input, {
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const nativeLegacy = toNativeUint8Array(maybeLegacy);
    if (nativeLegacy) return nativeLegacy;
  } catch {
    // fall through to no-arg serialize path
  }

  try {
    const maybeVersioned = serialize.call(input);
    return toNativeUint8Array(maybeVersioned);
  } catch {
    return null;
  }
}

function inferSolanaChainFromRpc(): "solana:mainnet" | "solana:devnet" | "solana:testnet" {
  const rpc = RPC_URL.toLowerCase();
  if (rpc.includes("devnet")) return "solana:devnet";
  if (rpc.includes("testnet")) return "solana:testnet";
  return "solana:mainnet";
}

// ---------------------------------------------------------------------------
// useEmbeddedWallet
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

      // Always log wallet info in dev to help diagnose future issues
      if (process.env.NODE_ENV === "development") {
        console.group("[useEmbeddedWallet] wallet resolution");
        console.log(
          "All wallets:",
          allWallets.map((w) => ({
            address: w.address,
            type: w.walletClientType,
            connector: w.connectorType,
            standardWalletName: w.standardWallet?.name,
            isPrivyStandard: w.standardWallet?.isPrivyWallet,
            // Log ALL keys to help identify the correct property names
            keys: Object.keys(w),
          }))
        );
        console.groupEnd();
      }

      // Prefer the Privy embedded wallet
      const embedded = allWallets.find(
        (w) =>
          w.walletClientType === "privy" ||
          w.standardWallet?.isPrivyWallet === true ||
          w.standardWallet?.name === "Privy"
      );

      // Fallback: any wallet with an address (external sign-in wallet)
      const fallback = allWallets.find((w) => w.address);

      const chosen = embedded ?? fallback ?? null;

      if (process.env.NODE_ENV === "development") {
        console.log("[useEmbeddedWallet] chosen:", chosen
          ? { address: chosen.address, type: chosen.walletClientType, connector: chosen.connectorType }
          : null
        );
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

  let signingWallet: {
    publicKey: PublicKey;
    signTransaction: (tx: unknown) => Promise<unknown>;
    sendTransaction?: (tx: unknown) => Promise<unknown>;
    signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
  } | null = null;

  if (resolvedWallet) {
    const chain = inferSolanaChainFromRpc();

    const signOne = async (tx: unknown): Promise<unknown> => {
      await ensureWalletConnected(resolvedWallet);

      const nativeBytes = toNativeUint8Array(tx) ?? trySerializeTransaction(tx);
      const walletId =
        resolvedWallet.walletClientType ??
        resolvedWallet.connectorType ??
        resolvedWallet.meta?.name ??
        resolvedWallet.address.slice(0, 8);

      if (process.env.NODE_ENV === "development") {
        console.log("[useEscrow] signTransaction input", {
          type: Object.prototype.toString.call(tx),
          hasNativeBytes: !!nativeBytes,
          byteLength: nativeBytes?.byteLength ?? null,
          walletId,
          chain,
        });
      }

      const attempts: Array<{ label: string; exec: () => Promise<unknown> }> = [];

      if (nativeBytes) {
        attempts.push({
          label: "bytes",
          exec: () => resolvedWallet.signTransaction(nativeBytes),
        });
        attempts.push({
          label: "args(transaction,wallet,chain,address)",
          exec: () =>
            resolvedWallet.signTransaction({
              transaction: nativeBytes,
              wallet: resolvedWallet,
              address: resolvedWallet.address,
              chain,
            }),
        });
        attempts.push({
          label: "args(transaction,address,chain)",
          exec: () =>
            resolvedWallet.signTransaction({
              transaction: nativeBytes,
              address: resolvedWallet.address,
              chain,
            }),
        });
        attempts.push({
          label: "args(transaction,chain)",
          exec: () =>
            resolvedWallet.signTransaction({
              transaction: nativeBytes,
              chain,
            }),
        });

        const signFeature = (
          resolvedWallet.features?.["solana:signTransaction"] as
            | {
                signTransaction?: (...inputs: unknown[]) => Promise<unknown>;
              }
            | undefined
        )?.signTransaction;

        if (signFeature) {
          attempts.push({
            label: "feature(solana:signTransaction)",
            exec: async () => {
              const account =
                (resolvedWallet as { accounts?: unknown[] }).accounts?.[0] ??
                undefined;
              const featureResult = await signFeature({
                account,
                chain,
                transaction: nativeBytes,
              });
              return Array.isArray(featureResult) ? featureResult[0] : featureResult;
            },
          });
        }
      }

      attempts.push({
        label: "raw",
        exec: () => resolvedWallet.signTransaction(tx),
      });

      const errors: string[] = [];
      for (const attempt of attempts) {
        try {
          const result = await attempt.exec();
          if (
            result &&
            typeof result === "object" &&
            "signedTransaction" in (result as object)
          ) {
            return (result as { signedTransaction: unknown }).signedTransaction;
          }
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${attempt.label}: ${message}`);
        }
      }

      console.error("[useEscrow] resolvedWallet.signTransaction threw:", {
        walletId,
        inputType: Object.prototype.toString.call(tx),
        attempts: errors,
      });

      throw new Error(`Wallet signing failed (${walletId}): ${errors.join(" | ")}`);
    };

    signingWallet = {
      publicKey: new PublicKey(resolvedWallet.address),
      signTransaction: signOne,
      sendTransaction: async (tx: unknown) => {
        await ensureWalletConnected(resolvedWallet);
        const nativeBytes = toNativeUint8Array(tx) ?? trySerializeTransaction(tx);
        const account =
          (resolvedWallet as { accounts?: unknown[] }).accounts?.[0] ?? undefined;
        const signAndSendFeature = (
          resolvedWallet.features?.["solana:signAndSendTransaction"] as
            | {
                signAndSendTransaction?: (...inputs: unknown[]) => Promise<unknown>;
              }
            | undefined
        )?.signAndSendTransaction;

        const attempts: Array<{ label: string; exec: () => Promise<unknown> }> = [];
        if (resolvedWallet.sendTransaction) {
          attempts.push({
            label: "wallet.sendTransaction(raw)",
            exec: () => resolvedWallet.sendTransaction!(tx),
          });
          if (nativeBytes) {
            attempts.push({
              label: "wallet.sendTransaction(args)",
              exec: () =>
                resolvedWallet.sendTransaction!({
                  transaction: nativeBytes,
                  address: resolvedWallet.address,
                  chain,
                }),
            });
          }
        }
        if (signAndSendFeature && nativeBytes) {
          attempts.push({
            label: "feature(solana:signAndSendTransaction)",
            exec: () =>
              signAndSendFeature({
                account,
                chain,
                transaction: nativeBytes,
              }),
          });
        }

        const errors: string[] = [];
        for (const attempt of attempts) {
          try {
            const result = await attempt.exec();
            const sig = extractSignatureFromSendResult(result);
            if (sig) return sig;
            errors.push(`${attempt.label}: missing signature in response`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${attempt.label}: ${message}`);
          }
        }

        throw new Error(`Wallet sendTransaction failed: ${errors.join(" | ")}`);
      },
      signAllTransactions: async (txs: unknown[]) => Promise.all(txs.map((tx) => signOne(tx))),
    };
  }

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
      const buyerLamports = await connection.getBalance(signingWallet.publicKey);
      const buyerSol = buyerLamports / LAMPORTS_PER_SOL;

      if (buyerSol < MIN_SOL_FOR_ESCROW_TXS) {
        throw new Error(
          `Insufficient SOL for network fees. ` +
            `Need at least ${MIN_SOL_FOR_ESCROW_TXS} SOL, found ${buyerSol.toFixed(6)} SOL. ` +
            `Request devnet SOL from faucet, then retry.`
        );
      }

      console.log("[useEscrow] escrow PDA:", escrowPubkey);

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

  async function anchorProofAttestation(
    tradeId: string,
    milestoneNumber: number,
    proofHashSha256: string
  ): Promise<string> {
    if (!walletReady || !signingWallet) {
      throw new Error("No Solana wallet connected");
    }
    return anchorProofHashOnChain({
      wallet: signingWallet,
      tradeId,
      milestoneNumber,
      proofHashSha256,
    });
  }

  return {
    loading,
    walletReady,
    walletAddress,
    handleFundEscrow,
    handleReleaseMilestone,
    handleRaiseDispute,
    handleRefund,
    anchorProofAttestation,
    fetchEscrowAccount,
  };
}
