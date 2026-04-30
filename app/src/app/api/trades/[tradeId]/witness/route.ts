import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";

type Context = { params: { tradeId: string } };

export const GET = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      milestones: { orderBy: { milestone_number: "asc" } },
      disputes: { orderBy: { created_at: "asc" } },
      receipt: true,
      buyer: true,
      supplier: true,
    },
  });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  const isMember = trade.buyer_id === req.user.id || trade.supplier_id === req.user.id;
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ledger = await prisma.ledgerEntry.findMany({
    where: { trade_id: tradeId },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    trade: {
      id: trade.id,
      trade_number: trade.trade_number,
      status: trade.status,
      buyer_wallet: trade.buyer.wallet_address,
      supplier_wallet: trade.supplier?.wallet_address ?? null,
      created_at: trade.created_at,
    },
    proof_attestations: trade.milestones.map((m) => ({
      milestone_number: m.milestone_number,
      proof_hash_sha256: m.proof_hash_sha256,
      proof_anchor_tx: m.proof_anchor_tx,
      proof_url: m.proof_url,
      proof_version: m.proof_version,
      proof_uploaded_at: m.proof_uploaded_at,
      proof_rejected_at: m.proof_rejected_at,
      proof_rejection_reason: m.proof_rejection_reason,
    })),
    disputes: trade.disputes.map((d) => ({
      id: d.id,
      status: d.status,
      reason: d.reason,
      created_at: d.created_at,
      resolved_at: d.resolved_at,
      arbiter_notes: d.arbiter_notes,
    })),
    ledger_chain: ledger.map((l) => ({
      id: l.id,
      event_type: l.event_type,
      amount_usdc: l.amount_usdc,
      reference_tx: l.reference_tx,
      entry_hash: l.entry_hash,
      previous_hash: l.previous_hash,
      created_at: l.created_at,
      metadata: l.metadata,
    })),
    receipt: trade.receipt
      ? {
          receipt_hash: trade.receipt.receipt_hash,
          previous_receipt_hash: trade.receipt.previous_receipt_hash,
          tx_signature: trade.receipt.tx_signature,
          issued_at: trade.receipt.issued_at,
          compliance_version: trade.receipt.compliance_version,
        }
      : null,
  });
});
