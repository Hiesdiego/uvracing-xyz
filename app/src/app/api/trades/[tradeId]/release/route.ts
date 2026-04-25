import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import {
  asNonEmptyString,
  asPositiveInt,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";
import { assertChainBackedTx } from "@/lib/solana/verify";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/release
// Called AFTER the on-chain release_milestone tx is confirmed
// Updates milestone status and trade status in DB
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { tradeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const milestone_number = asPositiveInt(
      body.milestone_number,
      "milestone_number"
    );
    const tx_signature = asNonEmptyString(body.tx_signature, "tx_signature");
    await assertChainBackedTx(tx_signature);

    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        milestones: { orderBy: { milestone_number: "asc" } },
        buyer: true,
        supplier: true,
      },
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    // Only buyer or arbiter wallet can confirm releases
    const isArbiter = req.walletAddress === process.env.NEXT_PUBLIC_ARBITER_WALLET;
    const isBuyer = trade.buyer_id === req.user.id;

    if (!isBuyer && !isArbiter) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const milestone = trade.milestones.find(
      (m) => m.milestone_number === milestone_number
    );
    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }
    if (milestone.status === "released") {
      return NextResponse.json(
        { error: "Milestone already released" },
        { status: 409 }
      );
    }
    if (milestone.status !== "proof_uploaded") {
      return NextResponse.json(
        { error: "Milestone proof must be uploaded before release" },
        { status: 400 }
      );
    }

    await prisma.milestone.update({
      where: {
        trade_id_milestone_number: {
          trade_id: tradeId,
          milestone_number,
        },
      },
      data: {
        status: "released",
        released_at: new Date(),
        tx_signature,
      },
    });

    // Determine new trade status
    const totalMilestones = trade.milestones.length;
    const newStatus =
      milestone_number === totalMilestones
        ? "completed"
        : milestone_number === 1
          ? "milestone_1_released"
          : milestone_number === 2
            ? "milestone_2_released"
            : "in_progress";

    const updatedTrade = await prisma.trade.update({
      where: { id: tradeId },
      data: { status: newStatus },
      include: {
        buyer: true,
        supplier: true,
        milestones: { orderBy: { milestone_number: "asc" } },
      },
    });

    // If completed — update reputation and trade counts
    if (newStatus === "completed" && trade.supplier_id) {
      await Promise.all([
        prisma.user.update({
          where: { id: trade.buyer_id },
          data: { completed_trades: { increment: 1 } },
        }),
        prisma.user.update({
          where: { id: trade.supplier_id },
          data: { completed_trades: { increment: 1 } },
        }),
        prisma.reputationEvent.createMany({
          data: [
            {
              user_id: trade.buyer_id,
              trade_id: tradeId,
              event_type: "trade_completed",
              score_delta: 0.1,
            },
            {
              user_id: trade.supplier_id,
              trade_id: tradeId,
              event_type: "trade_completed",
              score_delta: 0.1,
            },
          ],
        }),
        prisma.tradeReceipt.upsert({
          where: { trade_id: tradeId },
          create: { trade_id: tradeId, tx_signature },
          update: { tx_signature },
        }),
      ]);
    }

    return NextResponse.json(updatedTrade);
  } catch (error) {
    return validationErrorResponse(error);
  }
});