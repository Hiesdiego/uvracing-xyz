import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import {
  asNonEmptyString,
  asPositiveInt,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";
import { notifyDisputeRaised } from "@/lib/telegram/notifications";
import { assertChainBackedTx } from "@/lib/solana/verify";
import type { Trade } from "@/types";
import { appendLedgerEntry } from "@/lib/ledger";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/dispute — open a dispute on a milestone
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { tradeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const reason = asNonEmptyString(body.reason, "reason");
    const milestone_number =
      body.milestone_number !== undefined
        ? asPositiveInt(body.milestone_number, "milestone_number")
        : undefined;
    const tx_signature = asNonEmptyString(body.tx_signature, "tx_signature");
    await assertChainBackedTx(tx_signature);

    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { buyer: true, supplier: true },
    });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const isMember =
      trade.buyer_id === req.user.id || trade.supplier_id === req.user.id;
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (["completed", "cancelled", "refunded", "disputed"].includes(trade.status)) {
      return NextResponse.json(
        { error: "Cannot raise dispute on a closed trade" },
        { status: 400 }
      );
    }

    let milestoneId: string | undefined;
    if (milestone_number) {
      const milestone = await prisma.milestone.findUnique({
        where: {
          trade_id_milestone_number: {
            trade_id: tradeId,
            milestone_number,
          },
        },
      });
      if (!milestone) {
        return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
      }
      milestoneId = milestone.id;
    }

    const [dispute] = await Promise.all([
      prisma.dispute.create({
        data: {
          trade_id: tradeId,
          milestone_id: milestoneId ?? null,
          raised_by: req.user.id,
          reason,
          status: "open",
          arbiter_notes: `chain_tx:${tx_signature}`,
        },
      }),
      prisma.trade.update({
        where: { id: tradeId },
        data: { status: "disputed" },
      }),
      milestoneId
        ? prisma.milestone.update({
            where: { id: milestoneId },
            data: { status: "disputed" },
          })
        : Promise.resolve(),
      // Reputation penalty for raising a dispute
      prisma.reputationEvent.create({
        data: {
          user_id: req.user.id,
          trade_id: tradeId,
          event_type: "dispute_opened",
          score_delta: -0.3,
        },
      }),
    ]);

    await notifyDisputeRaised(
      trade.buyer_id,
      trade.buyer?.telegram_chat_id,
      trade.supplier_id,
      trade.supplier?.telegram_chat_id,
      process.env.ARBITER_TELEGRAM_CHAT_ID,
      trade as unknown as Trade,
      trade.buyer_id === req.user.id ? "buyer" : "supplier",
      reason
    );

    await appendLedgerEntry({
      tradeId,
      actorUserId: req.user.id,
      eventType: "dispute_opened",
      referenceTx: tx_signature,
      metadata: {
        dispute_id: dispute.id,
        reason,
        milestone_number: milestone_number ?? null,
      },
    });

    return NextResponse.json(dispute, { status: 201 });
  } catch (error) {
    return validationErrorResponse(error);
  }
});
