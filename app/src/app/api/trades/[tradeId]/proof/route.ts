import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { appendLedgerEntry } from "@/lib/ledger";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/proof — supplier uploads shipping proof for a milestone
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;
  const body = await req.json();
  const { milestone_number, proof_url, proof_hash_sha256, proof_anchor_tx } = body;

  if (!milestone_number || !proof_url || !proof_hash_sha256) {
    return NextResponse.json(
      { error: "milestone_number, proof_url and proof_hash_sha256 are required" },
      { status: 400 }
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(String(proof_hash_sha256))) {
    return NextResponse.json(
      { error: "proof_hash_sha256 must be a valid SHA-256 hex string" },
      { status: 400 }
    );
  }

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { milestones: true },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.supplier_id !== req.user.id) {
    return NextResponse.json(
      { error: "Only the supplier can upload proof" },
      { status: 403 }
    );
  }

  if (!["funded", "in_progress", "milestone_1_released", "milestone_2_released"].includes(trade.status)) {
    return NextResponse.json(
      { error: "Trade is not in a state that accepts proof" },
      { status: 400 }
    );
  }

  const milestone = await prisma.milestone.findUnique({
    where: {
      trade_id_milestone_number: {
        trade_id: tradeId,
        milestone_number: Number(milestone_number),
      },
    },
  });

  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  if (milestone.status === "released") {
    return NextResponse.json(
      { error: "This milestone has already been released" },
      { status: 400 }
    );
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      proof_url,
      proof_hash_sha256,
      proof_anchor_tx: proof_anchor_tx ?? null,
      proof_rejection_reason: null,
      proof_rejected_at: null,
      proof_version: { increment: 1 },
      proof_uploaded_at: new Date(),
      status: "proof_uploaded",
    },
  });

  await appendLedgerEntry({
    tradeId,
    actorUserId: req.user.id,
    eventType: "proof_uploaded",
    amountUsdc: Number(milestone.release_amount_usdc ?? 0),
    referenceTx: proof_anchor_tx ?? null,
    metadata: {
      milestone_number: Number(milestone_number),
      proof_url,
      proof_hash_sha256,
      proof_anchor_tx: proof_anchor_tx ?? null,
      proof_version: updated.proof_version,
    },
  });

  return NextResponse.json(updated);
});
