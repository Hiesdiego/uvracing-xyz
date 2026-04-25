"use client";

import { PrivyProvider as BasePrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: false,
});

const devnetRpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const mainnetRpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL ??
  "https://api.mainnet-beta.solana.com";
const devnetWsUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_WS_URL ??
  devnetRpcUrl.replace(/^http/i, "ws");
const mainnetWsUrl =
  process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_WS_URL ??
  mainnetRpcUrl.replace(/^http/i, "ws");

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