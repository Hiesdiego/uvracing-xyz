import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { computeReceiptHash } from "@/lib/ledger";

type Context = { params: { tradeId: string } };

export const GET = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      buyer: true,
      supplier: true,
      milestones: { orderBy: { milestone_number: "asc" } },
      disputes: { orderBy: { created_at: "asc" } },
      receipt: true,
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  const isMember = trade.buyer_id === req.user.id || trade.supplier_id === req.user.id;
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: { trade_id: tradeId },
    orderBy: { created_at: "asc" },
  });

  const releasedAmount = trade.milestones.reduce((sum, m) => {
    if (m.status !== "released") return sum;
    return sum + (Number(trade.total_amount_usdc) * m.release_percentage) / 100;
  }, 0);
  const refundedAmount = trade.status === "refunded" ? Number(trade.total_amount_usdc) - releasedAmount : 0;

  const payload = {
    compliance_version: "v1",
    generated_at: new Date().toISOString(),
    trade: {
      id: trade.id,
      trade_number: trade.trade_number,
      corridor: trade.corridor,
      status: trade.status,
      incoterm: trade.incoterm,
      created_at: trade.created_at.toISOString(),
      total_amount_usdc: Number(trade.total_amount_usdc),
      buyer_wallet: trade.buyer.wallet_address,
      supplier_wallet: trade.supplier?.wallet_address ?? null,
    },
    settlement: {
      released_amount_usdc: releasedAmount,
      refunded_amount_usdc: refundedAmount,
      net_realized_amount_usdc: releasedAmount - refundedAmount,
    },
    proof_attestations: trade.milestones.map((m) => ({
      milestone_number: m.milestone_number,
      proof_url: m.proof_url,
      proof_hash_sha256: m.proof_hash_sha256,
      proof_anchor_tx: m.proof_anchor_tx,
      proof_uploaded_at: m.proof_uploaded_at?.toISOString() ?? null,
      proof_rejected_at: m.proof_rejected_at?.toISOString() ?? null,
      proof_rejection_reason: m.proof_rejection_reason,
      proof_version: m.proof_version,
    })),
    disputes: trade.disputes.map((d) => ({
      id: d.id,
      status: d.status,
      reason: d.reason,
      resolved_at: d.resolved_at?.toISOString() ?? null,
      created_at: d.created_at.toISOString(),
    })),
    ledger: ledgerEntries.map((l) => ({
      id: l.id,
      event_type: l.event_type,
      amount_usdc: l.amount_usdc == null ? null : Number(l.amount_usdc),
      currency: l.currency,
      reference_tx: l.reference_tx,
      entry_hash: l.entry_hash,
      previous_hash: l.previous_hash,
      created_at: l.created_at.toISOString(),
    })),
  };

  const receiptHash = computeReceiptHash(payload);
  const previousHash = trade.receipt?.receipt_hash ?? null;

  const stored = await prisma.tradeReceipt.upsert({
    where: { trade_id: trade.id },
    create: {
      trade_id: trade.id,
      receipt_hash: receiptHash,
      previous_receipt_hash: previousHash,
      compliance_version: "v1",
      receipt_payload: payload,
      tx_signature: trade.receipt?.tx_signature ?? null,
    },
    update: {
      receipt_hash: receiptHash,
      previous_receipt_hash: previousHash,
      compliance_version: "v1",
      receipt_payload: payload,
    },
  });

  return NextResponse.json({
    receipt_hash: stored.receipt_hash,
    previous_receipt_hash: stored.previous_receipt_hash,
    payload,
  });
});
