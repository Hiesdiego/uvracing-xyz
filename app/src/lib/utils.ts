import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { USDC_FACTOR } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a wallet address to truncated display form */
export function shortAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function toSafeNumber(value: number | string | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

/** Format display USDC amount (e.g. 1.25) */
export function formatUsdc(
  amount: number | string | bigint | null | undefined
): string {
  const num = toSafeNumber(amount);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format USDC atomic units (6 decimals) to display string */
export function formatUsdcAtoms(
  amountAtoms: number | string | bigint | null | undefined
): string {
  const atoms = toSafeNumber(amountAtoms);
  return formatUsdc(atoms / USDC_FACTOR);
}

/** Convert display USDC amount to atomic units */
export function toUsdcAtoms(displayAmount: number): number {
  return Math.round(displayAmount * USDC_FACTOR);
}

/** Format a date string to readable form */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Generate a Solscan link for a transaction */
export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/** Generate a Solscan link for an account */
export function solscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}?cluster=devnet`;
}

/** Generate a trade number from an index */
export function generateTradeNumber(index: number): string {
  return `TRD-${String(index).padStart(3, "0")}`;
}
