import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { LedgerEventType, Prisma } from "@prisma/client";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function appendLedgerEntry(input: {
  tradeId: string;
  actorUserId?: string | null;
  eventType: LedgerEventType;
  amountUsdc?: number | null;
  referenceTx?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  const last = await prisma.ledgerEntry.findFirst({
    where: { trade_id: input.tradeId },
    orderBy: { created_at: "desc" },
  });

  const canonicalPayload = stableStringify({
    tradeId: input.tradeId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    amountUsdc: input.amountUsdc ?? null,
    referenceTx: input.referenceTx ?? null,
    metadata: input.metadata ?? null,
    previousHash: last?.entry_hash ?? null,
    ts: new Date().toISOString(),
  });

  const entryHash = sha256Hex(canonicalPayload);

  return prisma.ledgerEntry.create({
    data: {
      trade_id: input.tradeId,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      amount_usdc:
        input.amountUsdc == null ? null : (input.amountUsdc as unknown as Prisma.Decimal),
      reference_tx: input.referenceTx ?? null,
      metadata: input.metadata ?? undefined,
      entry_hash: entryHash,
      previous_hash: last?.entry_hash ?? null,
    },
  });
}

export function computeReceiptHash(payload: unknown): string {
  return sha256Hex(stableStringify(payload));
}
