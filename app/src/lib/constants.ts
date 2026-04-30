//app/src/lib/constants.ts

export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID!;
export const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT!;
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta";
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
export const RPC_WS_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_WS_URL ??
  RPC_URL.replace(/^http/i, "ws");
export const ARBITER_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET!;
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export const USDC_DECIMALS = 6;
export const USDC_FACTOR = Math.pow(10, USDC_DECIMALS);

export const TRADE_STATUS_LABELS: Record<string, string> = {
  pending_supplier: "Awaiting Supplier",
  pending_funding: "Awaiting Funding",
  funded: "Funded",
  in_progress: "In Progress",
  milestone_1_released: "Milestone 1 Released",
  milestone_2_released: "Milestone 2 Released",
  completed: "Completed",
  disputed: "Disputed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const TRADE_STATUS_COLORS: Record<string, string> = {
  pending_supplier: "text-yellow-400",
  pending_funding: "text-yellow-400",
  funded: "text-blue-400",
  in_progress: "text-blue-400",
  milestone_1_released: "text-blue-400",
  milestone_2_released: "text-blue-400",
  completed: "text-green-400",
  disputed: "text-red-400",
  cancelled: "text-muted-foreground",
  refunded: "text-muted-foreground",
};

export const DEFAULT_MILESTONE_BPS = [3000, 4000, 3000]; // 30% / 40% / 30%
