import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { applyReputationEvent } from "@/lib/reputation";
import { notifyDisputeResolved } from "@/lib/telegram/notifications";
import type { Trade } from "@/types";
import {
  asNonEmptyString,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";
import { assertChainBackedTx } from "@/lib/solana/verify";

type Context = { params: { disputeId: string } };

// POST /api/disputes/[disputeId]/resolve — arbiter resolves a dispute
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { disputeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const resolution = asNonEmptyString(body.resolution, "resolution");
    const arbiter_notes =
      typeof body.arbiter_notes === "string" ? body.arbiter_notes : null;
    const tx_signature = asNonEmptyString(body.tx_signature, "tx_signature");
    await assertChainBackedTx(tx_signature);

    // Only arbiter wallet can resolve
    const isArbiter = req.walletAddress === process.env.NEXT_PUBLIC_ARBITER_WALLET;
    if (!isArbiter) {
      return NextResponse.json(
        { error: "Only the arbiter can resolve disputes" },
        { status: 403 }
      );
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { trade: { include: { buyer: true, supplier: true } } },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }
    if (!["open", "under_review"].includes(dispute.status)) {
      return NextResponse.json(
        { error: "Dispute has already been resolved" },
        { status: 409 }
      );
    }

    const statusMap: Record<
      string,
      "resolved_buyer" | "resolved_supplier" | "resolved_split"
    > = {
      buyer: "resolved_buyer",
      supplier: "resolved_supplier",
      split: "resolved_split",
    };

    const disputeStatus = statusMap[resolution];
    if (!disputeStatus) {
      return NextResponse.json(
        { error: "resolution must be buyer, supplier, or split" },
        { status: 400 }
      );
    }

    const trade = dispute.trade;
    const loserId = resolution === "buyer" ? trade.supplier_id : trade.buyer_id;
    const winnerId = resolution === "buyer" ? trade.buyer_id : trade.supplier_id;
    const finalTradeStatus = resolution === "buyer" ? "refunded" : "completed";

    await Promise.all([
      prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: disputeStatus,
          arbiter_notes: `${arbiter_notes ?? ""}${
            arbiter_notes ? "\n" : ""
          }chain_tx:${tx_signature}`,
          resolved_at: new Date(),
        },
      }),
      prisma.trade.update({
        where: { id: trade.id },
        data: { status: finalTradeStatus },
      }),
      dispute.milestone_id
        ? prisma.milestone.update({
            where: { id: dispute.milestone_id },
            data: { status: resolution === "buyer" ? "pending" : "released" },
          })
        : Promise.resolve(),
      prisma.tradeReceipt.upsert({
        where: { trade_id: trade.id },
        create: { trade_id: trade.id, tx_signature },
        update: { tx_signature },
      }),
    ]);

    if (loserId) {
      await applyReputationEvent({
        userId: loserId,
        tradeId: trade.id,
        eventType: "dispute_ruled_against",
        scoreDelta: -0.5,
      });
    }
    if (winnerId && resolution !== "split") {
      await applyReputationEvent({
        userId: winnerId,
        tradeId: trade.id,
        eventType: "dispute_ruled_in_favor",
        scoreDelta: 0.1,
      });
    }

    notifyDisputeResolved(
      trade.buyer_id,
      trade.buyer?.telegram_chat_id,
      trade.supplier_id,
      trade.supplier?.telegram_chat_id,
      trade as unknown as Trade,
      resolution as "buyer" | "supplier" | "split",
      arbiter_notes
    ).catch(console.error);

    return NextResponse.json({ success: true, resolution });
  } catch (error) {
    return validationErrorResponse(error);
  }
});
