"use client";

/**
 * WalletDebugPanel
 *
 * Drop this anywhere in your app to see the full wallet + RPC + program state.
 * Add it to the trade detail page while debugging, remove before production.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  deriveEscrowPda,
  deriveEscrowTokenPda,
  deriveMilestoneConfigPda,
  normalizeTradeSeed,
} from "@/lib/solana/program";
import { RPC_URL, PROGRAM_ID, USDC_MINT, ARBITER_WALLET } from "@/lib/constants";

type Check = {
  label: string;
  status: "ok" | "warn" | "error" | "loading" | "info";
  value: string;
};

function Row({ check }: { check: Check }) {
  const color = {
    ok: "text-green-400",
    warn: "text-yellow-400",
    error: "text-red-400",
    loading: "text-blue-400",
    info: "text-muted-foreground",
  }[check.status];

  const dot = {
    ok: "o",
    warn: "^",
    error: "x",
    loading: "~",
    info: ".",
  }[check.status];

  return (
    <div className="flex items-start gap-2 font-mono text-xs">
      <span className={`flex-shrink-0 w-4 ${color}`}>{dot}</span>
      <span className="text-muted-foreground flex-shrink-0 w-52">{check.label}</span>
      <span className={`break-all ${color}`}>{check.value}</span>
    </div>
  );
}

export function WalletDebugPanel({ tradeId }: { tradeId?: string }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const runRef = useRef(false);

  const runDiagnostics = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);

    const results: Check[] = [];

    results.push({
      label: "Privy ready",
      status: ready ? "ok" : "error",
      value: String(ready),
    });

    results.push({
      label: "Privy authenticated",
      status: authenticated ? "ok" : "error",
      value: String(authenticated),
    });

    results.push({
      label: "wallets[] length",
      status: wallets.length > 0 ? "ok" : "error",
      value: String(wallets.length),
    });

    wallets.forEach((w, i) => {
      const walletType = (w as { walletClientType?: string }).walletClientType ?? "unknown";
      const connectorType = (w as { connectorType?: string }).connectorType ?? "unknown";
      const meta = (w as { meta?: { id?: string; name?: string } }).meta;
      const standardWallet = (w as { standardWallet?: { name?: string; isPrivyWallet?: boolean } })
        .standardWallet;
      const isEmbedded =
        walletType === "privy" ||
        standardWallet?.isPrivyWallet === true ||
        standardWallet?.name === "Privy";
      results.push({
        label: `wallet[${i}] type`,
        status: isEmbedded ? "ok" : "warn",
        value: `${walletType}${isEmbedded ? " (embedded: use this)" : " (external: may conflict)"}`,
      });
      results.push({
        label: `wallet[${i}] connector/meta`,
        status: "info",
        value: `${connectorType} | ${meta?.id ?? "no-meta-id"}${meta?.name ? ` (${meta.name})` : ""}`,
      });
      results.push({
        label: `wallet[${i}] standard wallet`,
        status: "info",
        value: `${standardWallet?.name ?? "unknown"} | isPrivy=${String(standardWallet?.isPrivyWallet ?? false)}`,
      });
      results.push({
        label: `wallet[${i}] address`,
        status: w.address ? "ok" : "error",
        value: w.address ?? "MISSING",
      });
    });

    const embeddedWallet = wallets.find(
      (w) => {
        const typed = w as {
          walletClientType?: string;
          standardWallet?: { name?: string; isPrivyWallet?: boolean };
        };
        return (
          typed.walletClientType === "privy" ||
          typed.standardWallet?.isPrivyWallet === true ||
          typed.standardWallet?.name === "Privy"
        );
      }
    );
    results.push({
      label: "embedded wallet found",
      status: embeddedWallet ? "ok" : "error",
      value: embeddedWallet ? embeddedWallet.address : "NOT FOUND: user may not have embedded wallet yet",
    });

    const linkedWallet = user?.linkedAccounts?.find(
      (a) => a.type === "wallet"
    ) as { address?: string; chain_type?: string } | undefined;
    results.push({
      label: "user linkedAccount wallet",
      status: linkedWallet?.address ? "ok" : "warn",
      value: linkedWallet
        ? `${linkedWallet.address} (chain: ${linkedWallet.chain_type ?? "unknown"})`
        : "NONE",
    });

    if (embeddedWallet && linkedWallet?.address) {
      const match = embeddedWallet.address === linkedWallet.address;
      results.push({
        label: "embedded === linked account",
        status: match ? "ok" : "warn",
        value: match
          ? "yes"
          : `NO: embedded ${embeddedWallet.address?.slice(0, 8)} vs linked ${linkedWallet.address?.slice(0, 8)}`,
      });
    }

    if (wallets[0]) {
      const firstWallet = wallets[0] as {
        isConnected?: () => Promise<boolean>;
      };
      try {
        const connected = await firstWallet.isConnected?.();
        if (typeof connected === "boolean") {
          results.push({
            label: "wallet[0] isConnected()",
            status: connected ? "ok" : "warn",
            value: String(connected),
          });
        }
      } catch (e) {
        results.push({
          label: "wallet[0] isConnected()",
          status: "warn",
          value: `THREW: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    try {
      const token = await getAccessToken();
      results.push({
        label: "getAccessToken()",
        status: token ? "ok" : "error",
        value: token ? `obtained (${token.length} chars)` : "NULL: auth broken",
      });
    } catch (e) {
      results.push({
        label: "getAccessToken()",
        status: "error",
        value: `THREW: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    results.push({
      label: "RPC_URL",
      status: RPC_URL ? "info" : "error",
      value: RPC_URL ?? "NOT SET (NEXT_PUBLIC_SOLANA_RPC_URL missing)",
    });

    try {
      const conn = new Connection(RPC_URL, "confirmed");
      const start = Date.now();
      const slot = await conn.getSlot();
      const latency = Date.now() - start;
      results.push({
        label: "RPC ping (getSlot)",
        status: latency < 2000 ? "ok" : "warn",
        value: `slot ${slot} in ${latency}ms`,
      });
    } catch (e) {
      results.push({
        label: "RPC ping",
        status: "error",
        value: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    results.push({
      label: "PROGRAM_ID",
      status: PROGRAM_ID ? "ok" : "error",
      value: PROGRAM_ID ?? "NOT SET",
    });
    results.push({
      label: "USDC_MINT",
      status: USDC_MINT ? "ok" : "error",
      value: USDC_MINT ?? "NOT SET",
    });
    results.push({
      label: "ARBITER_WALLET",
      status: ARBITER_WALLET ? "ok" : "error",
      value: ARBITER_WALLET ?? "NOT SET",
    });

    const buyerAddress = embeddedWallet?.address ?? linkedWallet?.address;
    if (buyerAddress) {
      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const pubkey = new PublicKey(buyerAddress);

        const solBal = await conn.getBalance(pubkey);
        results.push({
          label: "buyer SOL balance",
          status: solBal > 5000 ? "ok" : "warn",
          value: `${(solBal / LAMPORTS_PER_SOL).toFixed(5)} SOL${solBal < 5000 ? " (too low for tx fees)" : ""}`,
        });

        if (USDC_MINT) {
          const mint = new PublicKey(USDC_MINT);
          const ata = await getAssociatedTokenAddress(mint, pubkey);
          try {
            const usdcBal = await conn.getTokenAccountBalance(ata);
            const usdcAmt = Number(usdcBal.value.amount) / 1e6;
            results.push({
              label: "buyer USDC balance",
              status: usdcAmt > 0 ? "ok" : "warn",
              value: `${usdcAmt.toFixed(2)} USDC (ATA: ${ata.toBase58().slice(0, 8)}...)`,
            });
          } catch {
            results.push({
              label: "buyer USDC balance",
              status: "warn",
              value: "ATA does not exist yet (will be created on fund)",
            });
          }
        }
      } catch (e) {
        results.push({
          label: "buyer balances",
          status: "error",
          value: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    if (tradeId) {
      const seed = normalizeTradeSeed(tradeId);
      const [escrowPda] = deriveEscrowPda(tradeId);
      const [escrowTokenPda] = deriveEscrowTokenPda(escrowPda);
      const [milestonePda] = deriveMilestoneConfigPda(escrowPda);

      results.push({ label: "trade_id (raw)", status: "info", value: tradeId });
      results.push({ label: "normalized seed", status: "info", value: seed });
      results.push({ label: "escrow PDA", status: "info", value: escrowPda.toBase58() });
      results.push({ label: "escrow token PDA", status: "info", value: escrowTokenPda.toBase58() });
      results.push({ label: "milestone config PDA", status: "info", value: milestonePda.toBase58() });

      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const escrowInfo = await conn.getAccountInfo(escrowPda);
        results.push({
          label: "escrow account on-chain",
          status: escrowInfo ? "ok" : "warn",
          value: escrowInfo
            ? `EXISTS (owner: ${escrowInfo.owner.toBase58().slice(0, 8)}..., ${escrowInfo.data.length} bytes)`
            : "NOT YET CREATED (init needed)",
        });

        const escrowTokenInfo = await conn.getAccountInfo(escrowTokenPda);
        results.push({
          label: "escrow token account",
          status: escrowTokenInfo ? "ok" : "warn",
          value: escrowTokenInfo
            ? `EXISTS (${escrowTokenInfo.data.length} bytes)`
            : "NOT YET CREATED",
        });
      } catch (e) {
        results.push({
          label: "escrow on-chain check",
          status: "error",
          value: `FAILED: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    setChecks(results);
    setRunning(false);
    runRef.current = false;
  }, [ready, authenticated, user, wallets, getAccessToken, tradeId]);

  useEffect(() => {
    if (!open || !ready || checks.length > 0) return;
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, checks.length]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 left-6 z-[9998] rounded-full border border-yellow-500/40 bg-black/90 px-3 py-2 text-xs font-semibold text-yellow-400 shadow-lg hover:bg-black"
      >
        {open ? "Close Debug" : "Wallet Debug"}
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-[9999] w-[min(92vw,680px)] max-h-[70vh] overflow-y-auto rounded-xl border border-yellow-500/40 bg-black/95 p-4 shadow-2xl text-xs">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-yellow-400">Wallet Debug Panel</span>
            <div className="flex gap-2">
              <button
                onClick={runDiagnostics}
                disabled={running}
                className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-400 transition-colors hover:bg-yellow-500/30 disabled:opacity-50"
              >
                {running ? "Running..." : "Re-run"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded border border-yellow-500/40 px-2 py-1 text-yellow-300 transition-colors hover:bg-yellow-500/15"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {checks.length === 0 ? (
              <span className="text-muted-foreground">Running diagnostics...</span>
            ) : (
              checks.map((c, i) => <Row key={i} check={c} />)
            )}
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Remove this panel before going to production. {`process.env.NODE_ENV === "production"`} already hides it automatically.
          </p>
        </div>
      )}
    </>
  );
}
