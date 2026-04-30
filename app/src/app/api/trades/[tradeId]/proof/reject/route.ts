import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { appendLedgerEntry } from "@/lib/ledger";

type Context = { params: { tradeId: string } };

export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;
  const body = await req.json();
  const milestone_number = Number(body?.milestone_number);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(milestone_number) || milestone_number <= 0) {
    return NextResponse.json({ error: "Valid milestone_number is required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
  }

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { milestones: true },
  });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (trade.buyer_id !== req.user.id) {
    return NextResponse.json({ error: "Only buyer can reject proof" }, { status: 403 });
  }

  const milestone = trade.milestones.find((m) => m.milestone_number === milestone_number);
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }
  if (milestone.status !== "proof_uploaded") {
    return NextResponse.json(
      { error: "Only proof_uploaded milestones can be rejected" },
      { status: 400 }
    );
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      status: "pending",
      proof_rejection_reason: reason,
      proof_rejected_at: new Date(),
    },
  });

  await appendLedgerEntry({
    tradeId,
    actorUserId: req.user.id,
    eventType: "proof_rejected",
    amountUsdc: Number(milestone.release_amount_usdc ?? 0),
    metadata: {
      milestone_number,
      reason,
      previous_proof_hash_sha256: milestone.proof_hash_sha256,
      previous_proof_url: milestone.proof_url,
    },
  });

  return NextResponse.json(updated);
});
