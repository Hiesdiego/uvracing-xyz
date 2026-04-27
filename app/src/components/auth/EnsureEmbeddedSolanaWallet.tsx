"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useWallets,
} from "@privy-io/react-auth/solana";

type PrivyWallet = {
  address?: string;
  walletClientType?: string;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const withExtras = error as Error & {
      code?: string;
      status?: number;
      cause?: unknown;
    };
    return {
      name: withExtras.name,
      message: withExtras.message,
      code: withExtras.code,
      status: withExtras.status,
      cause: withExtras.cause,
      stack: withExtras.stack,
    };
  }
  if (typeof error === "object" && error !== null) {
    return { ...(error as Record<string, unknown>) };
  }
  return { value: String(error) };
}

export function EnsureEmbeddedSolanaWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [creating, setCreating] = useState(false);
  const attemptedForUserRef = useRef<string | null>(null);

  const userId = user?.id ?? null;
  const allWallets = wallets as unknown as PrivyWallet[];
  const embeddedWallet = useMemo(
    () => allWallets.find((w) => w.walletClientType === "privy" && !!w.address),
    [allWallets]
  );

  useEffect(() => {
    if (!ready || !authenticated || !userId) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[EnsureEmbeddedSolanaWallet] wallet state", {
        userId,
        walletCount: allWallets.length,
        hasEmbedded: !!embeddedWallet,
        wallets: allWallets.map((w) => ({
          address: w.address,
          type: w.walletClientType,
        })),
      });
    }
  }, [ready, authenticated, userId, allWallets, embeddedWallet]);

  useEffect(() => {
    if (!ready || !authenticated || !userId) {
      attemptedForUserRef.current = null;
      return;
    }
    if (embeddedWallet || creating) return;
    if (attemptedForUserRef.current === userId) return;

    attemptedForUserRef.current = userId;
    setCreating(true);

    console.warn("[EnsureEmbeddedSolanaWallet] creating missing embedded wallet", {
      userId,
    });

    createWallet()
      .then(({ wallet }) => {
        console.log("[EnsureEmbeddedSolanaWallet] embedded wallet created", {
          userId,
          walletAddress: wallet.address,
        });
      })
      .catch((error) => {
        const details = serializeError(error);
        const message = String(details.message ?? "").toLowerCase();
        const alreadyExists =
          message.includes("already") &&
          message.includes("embedded") &&
          message.includes("wallet");

        // Retry only for non-terminal errors.
        if (!alreadyExists) {
          attemptedForUserRef.current = null;
        }

        if (alreadyExists) {
          console.warn(
            "[EnsureEmbeddedSolanaWallet] createWallet skipped (already exists)",
            {
              userId,
              details,
            }
          );
        } else {
          console.error("[EnsureEmbeddedSolanaWallet] createWallet failed", {
            userId,
            details,
            alreadyExists,
          });
        }
      })
      .finally(() => {
        setCreating(false);
      });
  }, [ready, authenticated, userId, embeddedWallet, creating, createWallet]);

  return null;
}
