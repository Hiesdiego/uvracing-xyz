import { randomBytes } from "node:crypto";

/**
 * Generates non-sequential trade numbers to avoid predictable enumeration.
 * Example: TRD-26G7-4X9Q2B
 */
export function generateTradeNumber(): string {
  const y = new Date().getUTCFullYear().toString().slice(-2);
  const m = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const entropy = randomBytes(3).toString("hex").toUpperCase(); // 6 chars
  return `TRD-${y}${m}-${entropy}`;
}