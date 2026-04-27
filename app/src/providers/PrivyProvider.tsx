"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const devnetRpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const mainnetRpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

// ws(s) derivation: replace http(s) at start of string only
const devnetWsUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_WS_URL ??
  devnetRpcUrl.replace(/^https?/i, "wss");
const mainnetWsUrl =
  process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_WS_URL ??
  mainnetRpcUrl.replace(/^https?/i, "wss");

// ── Dev-only RPC health check ────────────────────────────────────────────────
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  console.group("[PrivyProvider] RPC init");
  console.log("devnet RPC :", devnetRpcUrl);
  console.log("devnet WS  :", devnetWsUrl);
  console.log("mainnet RPC:", mainnetRpcUrl);
  console.log("mainnet WS :", mainnetWsUrl);
  console.groupEnd();

  fetch(devnetRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  })
    .then((r) => r.json())
    .then((d) => console.log("[PrivyProvider] devnet RPC health:", d?.result ?? d?.error ?? d))
    .catch((e) => console.error("[PrivyProvider] devnet RPC UNREACHABLE:", e.message));
}

// ---------------------------------------------------------------------------
// FIX: shouldAutoConnect: false
//
// When true, any previously-connected EXTERNAL wallet (Phantom, Backpack…)
// is auto-reconnected on page load and ends up at wallets[0], displacing the
// Privy embedded wallet. The escrow then tries to sign with a wallet the user
// didn't intend (and that may not have USDC), producing a silent failure.
//
// Setting this to false keeps external wallets available for explicit
// connection but prevents them hijacking wallets[0]. The embedded wallet is
// then reliably at wallets[0] for all authenticated users.
// ---------------------------------------------------------------------------
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

const devnetRpc = createSolanaRpc(devnetRpcUrl);
const devnetRpcSubscriptions = createSolanaRpcSubscriptions(devnetWsUrl);
const mainnetRpc = createSolanaRpc(mainnetRpcUrl);
const mainnetRpcSubscriptions = createSolanaRpcSubscriptions(mainnetWsUrl);

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <BasePrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#F5A623",
          logo: "/logo.png",
        },
        loginMethods: ["email", "wallet", "google"],
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solana: {
          rpcs: {
            "solana:devnet": {
              rpc: devnetRpc,
              rpcSubscriptions: devnetRpcSubscriptions,
              blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
            },
            "solana:mainnet": {
              rpc: mainnetRpc,
              rpcSubscriptions: mainnetRpcSubscriptions,
              blockExplorerUrl: "https://explorer.solana.com",
            },
          },
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}