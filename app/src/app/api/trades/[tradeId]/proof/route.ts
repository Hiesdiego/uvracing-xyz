import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/proof — supplier uploads shipping proof for a milestone
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;
  const body = await req.json();
  const { milestone_number, proof_url } = body;

  if (!milestone_number || !proof_url) {
    return NextResponse.json(
      { error: "milestone_number and proof_url are required" },
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
      proof_uploaded_at: new Date(),
      status: "proof_uploaded",
    },
  });

  return NextResponse.json(updated);
});