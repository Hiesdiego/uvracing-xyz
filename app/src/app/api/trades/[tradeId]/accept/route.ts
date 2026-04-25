import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import {
  asNonEmptyString,
  safeJson,
  validationErrorResponse,
} from "@/lib/api/validation";

type Context = { params: { tradeId: string } };

// POST /api/trades/[tradeId]/accept — supplier accepts a trade invitation
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { tradeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const invite_token = asNonEmptyString(body.invite_token, "invite_token");

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.status !== "pending_supplier") {
      return NextResponse.json(
        { error: "Trade is no longer awaiting a supplier" },
        { status: 400 }
      );
    }
    if (!trade.supplier_invite_token || trade.supplier_invite_token !== invite_token) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 403 });
    }

    // Buyer cannot accept their own trade
    if (trade.buyer_id === req.user.id) {
      return NextResponse.json(
        { error: "Buyer cannot accept their own trade" },
        { status: 400 }
      );
    }

    const updated = await prisma.trade.update({
      where: { id: tradeId },
      data: {
        supplier_id: req.user.id,
        status: "pending_funding",
      },
      include: {
        buyer: true,
        supplier: true,
        milestones: { orderBy: { milestone_number: "asc" } },
      },
    });

    // Update trade counts for both parties
    await prisma.user.update({
      where: { id: req.user.id },
      data: { total_trades: { increment: 1 } },
    });
    await prisma.user.update({
      where: { id: trade.buyer_id },
      data: { total_trades: { increment: 1 } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return validationErrorResponse(error);
  }
});