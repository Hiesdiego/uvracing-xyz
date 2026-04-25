import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { notifyNewMessage } from "@/lib/telegram/notifications";
import type { Trade } from "@/types";

const ADMIN_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET;

type Context = { params: { tradeId: string } };

/**
 * Check if the requesting user is allowed to access this trade's messages.
 * Only buyer, supplier, and platform admin (arbiter wallet) can read/write.
 */
function canAccessMessages(
  trade: { buyer_id: string; supplier_id: string | null },
  userId: string,
  walletAddress: string
): boolean {
  return (
    trade.buyer_id === userId ||
    trade.supplier_id === userId ||
    walletAddress === ADMIN_WALLET
  );
}

// GET /api/trades/[tradeId]/messages — fetch all messages for a trade
export const GET = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    select: { buyer_id: true, supplier_id: true },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (!canAccessMessages(trade, req.user.id, req.walletAddress)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await prisma.tradeMessage.findMany({
    where: { trade_id: tradeId },
    include: {
      sender: {
        select: {
          id: true,
          display_name: true,
          wallet_address: true,
          business_name: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json(messages);
});

// POST /api/trades/[tradeId]/messages — send a message
export const POST = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { tradeId } = ctx.params;
  const body = await req.json();
  const { content } = body;

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 }
    );
  }

  if (content.length > 2000) {
    return NextResponse.json(
      { error: "Message must be under 2000 characters" },
      { status: 400 }
    );
  }

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      buyer: { select: { id: true, telegram_chat_id: true, display_name: true, wallet_address: true } },
      supplier: { select: { id: true, telegram_chat_id: true, display_name: true, wallet_address: true } },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (!canAccessMessages(trade, req.user.id, req.walletAddress)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block messaging on closed trades
  if (["cancelled", "refunded"].includes(trade.status)) {
    return NextResponse.json(
      { error: "Cannot send messages on a closed trade" },
      { status: 400 }
    );
  }

  const message = await prisma.tradeMessage.create({
    data: {
      trade_id: tradeId,
      sender_id: req.user.id,
      content: content.trim(),
    },
    include: {
      sender: {
        select: {
          id: true,
          display_name: true,
          wallet_address: true,
          business_name: true,
        },
      },
    },
  });

  // Notify the other party via Telegram (fire and forget)
  const senderName =
    req.user.display_name ??
    req.user.business_name ??
    shortAddress(req.user.wallet_address);

  const isBuyer = trade.buyer_id === req.user.id;
  const recipientChatId = isBuyer
    ? trade.supplier?.telegram_chat_id
    : trade.buyer?.telegram_chat_id;
  const recipientUserId = isBuyer ? trade.supplier_id : trade.buyer_id;

  notifyNewMessage(
    recipientUserId,
    recipientChatId,
    trade as unknown as Trade,
    senderName
  ).catch(console.error);

  return NextResponse.json(message, { status: 201 });
});

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}