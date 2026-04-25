import { bot } from "./bot";
import { formatUsdc } from "@/lib/utils";
import { APP_URL } from "@/lib/constants";
import type { Trade, Milestone } from "@/types";
import { prisma } from "@/lib/db/prisma";

/**
 * Send a message to a user by their telegram_chat_id.
 * Silently fails if the user has no Telegram connected — never throws.
 */
async function notify(
  chatId: string | null | undefined,
  message: string,
  options?: { parse_mode?: "Markdown" | "HTML" }
): Promise<void> {
  if (!chatId) return;
  try {
    await bot.api.sendMessage(chatId, message, {
      parse_mode: options?.parse_mode ?? "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    // User may have blocked the bot — log silently
    console.error(`[Telegram] Failed to notify chat ${chatId}:`, err);
  }
}

async function notifyLinkedUser(
  userId: string | null | undefined,
  chatId: string | null | undefined,
  message: string
): Promise<void> {
  if (!userId || !chatId) return;
  const user = await prisma.user.findFirst({
    where: { id: userId, telegram_chat_id: chatId },
    select: { id: true },
  });
  if (!user) return;
  await notify(chatId, message);
}

const tradeUrl = (tradeId: string) => `${APP_URL}/trades/${tradeId}`;

// ─── Notification Functions ───────────────────────────────────────────────────

/**
 * Sent to supplier when a trade invite is created
 */
export async function notifyTradeInvite(
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  trade: Trade
): Promise<void> {
  await notifyLinkedUser(
    supplierId,
    supplierChatId,
    `📦 *New Trade Order*\n\nYou've been invited to a trade by a buyer.\n\n*${trade.trade_number}* — ${trade.goods_description}\n💰 $${formatUsdc(Number(trade.total_amount_usdc))} USDC\n🌍 ${trade.corridor}\n\nReview and accept on TradeOS:\n${tradeUrl(trade.id)}`
  );
}

/**
 * Sent to supplier when buyer funds the escrow
 */
export async function notifyEscrowFunded(
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  trade: Trade
): Promise<void> {
  await notifyLinkedUser(
    supplierId,
    supplierChatId,
    `🔒 *Escrow Funded*\n\n*${trade.trade_number}* is now fully funded.\n\n💰 $${formatUsdc(Number(trade.total_amount_usdc))} USDC locked on Solana.\n\nProceed with shipment and upload your shipping proof on TradeOS:\n${tradeUrl(trade.id)}`
  );
}

/**
 * Sent to buyer when supplier uploads shipping proof
 */
export async function notifyProofUploaded(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  trade: Trade,
  milestone: Milestone
): Promise<void> {
  await notifyLinkedUser(
    buyerId,
    buyerChatId,
    `📄 *Shipping Proof Uploaded*\n\nYour supplier has uploaded proof for *Milestone ${milestone.milestone_number}* on trade *${trade.trade_number}*.\n\nReview and approve to release $${formatUsdc((Number(trade.total_amount_usdc) * milestone.release_percentage) / 100)} USDC:\n${tradeUrl(trade.id)}`
  );
}

/**
 * Sent to both parties when a milestone is released
 */
export async function notifyMilestoneReleased(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  trade: Trade,
  milestone: Milestone,
  txSignature: string
): Promise<void> {
  const amount = formatUsdc(
    (Number(trade.total_amount_usdc) * milestone.release_percentage) / 100
  );

  const supplierMsg = `✅ *Milestone ${milestone.milestone_number} Released*\n\n$${amount} USDC has been sent to your wallet.\n\nTrade: *${trade.trade_number}*\nTx: \`${txSignature.slice(0, 16)}...\`\n\n${tradeUrl(trade.id)}`;

  const buyerMsg = `✅ *Milestone ${milestone.milestone_number} Released*\n\n$${amount} USDC released to supplier for *${trade.trade_number}*.\n\n${tradeUrl(trade.id)}`;

  await Promise.all([
    notifyLinkedUser(supplierId, supplierChatId, supplierMsg),
    notifyLinkedUser(buyerId, buyerChatId, buyerMsg),
  ]);
}

/**
 * Sent to both parties + arbiter when a dispute is raised
 */
export async function notifyDisputeRaised(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  arbiterChatId: string | null | undefined,
  trade: Trade,
  raisedByRole: "buyer" | "supplier",
  reason: string
): Promise<void> {
  const raisedByLabel = raisedByRole === "buyer" ? "Buyer" : "Supplier";

  const partyMsg = `🚨 *Dispute Opened*\n\nA dispute has been raised on trade *${trade.trade_number}* by the ${raisedByLabel}.\n\nEscrow is now frozen. The TradeOS arbiter will review and resolve.\n\nReason: _${reason}_\n\n${tradeUrl(trade.id)}`;

  const arbiterMsg = `⚖️ *Dispute Needs Review*\n\nTrade *${trade.trade_number}* has an open dispute.\n\nRaised by: ${raisedByLabel}\nReason: _${reason}_\n\nReview on admin dashboard:\n${APP_URL}/admin`;

  await Promise.all([
    notifyLinkedUser(buyerId, buyerChatId, partyMsg),
    notifyLinkedUser(supplierId, supplierChatId, partyMsg),
    notify(arbiterChatId, arbiterMsg),
  ]);
}

/**
 * Sent to both parties when arbiter resolves a dispute
 */
export async function notifyDisputeResolved(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  trade: Trade,
  resolution: "buyer" | "supplier" | "split",
  arbiterNotes?: string | null
): Promise<void> {
  const resolutionLabel = {
    buyer: "ruled in favour of the Buyer — funds returned.",
    supplier: "ruled in favour of the Supplier — funds released.",
    split: "ruled a split settlement between both parties.",
  }[resolution];

  const msg = `⚖️ *Dispute Resolved*\n\nTrade *${trade.trade_number}* dispute has been resolved.\n\nOutcome: ${resolutionLabel}${arbiterNotes ? `\n\nArbiter note: _${arbiterNotes}_` : ""}\n\n${tradeUrl(trade.id)}`;

  await Promise.all([
    notifyLinkedUser(buyerId, buyerChatId, msg),
    notifyLinkedUser(supplierId, supplierChatId, msg),
  ]);
}

/**
 * Sent to both parties when trade is fully completed
 */
export async function notifyTradeCompleted(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  supplierId: string | null | undefined,
  supplierChatId: string | null | undefined,
  trade: Trade
): Promise<void> {
  const buyerMsg = `🎉 *Trade Complete*\n\n*${trade.trade_number}* is fully settled.\n\nAll milestones released. Reputation scores updated.\n\n${tradeUrl(trade.id)}`;

  const supplierMsg = `🎉 *Trade Complete*\n\n*${trade.trade_number}* is fully settled.\n\n$${formatUsdc(Number(trade.total_amount_usdc))} USDC total received. Reputation scores updated.\n\n${tradeUrl(trade.id)}`;

  await Promise.all([
    notifyLinkedUser(buyerId, buyerChatId, buyerMsg),
    notifyLinkedUser(supplierId, supplierChatId, supplierMsg),
  ]);
}

/**
 * Sent to buyer when a refund is processed
 */
export async function notifyRefundProcessed(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  trade: Trade,
  txSignature: string
): Promise<void> {
  await notifyLinkedUser(
    buyerId,
    buyerChatId,
    `↩️ *Refund Processed*\n\n$${formatUsdc(Number(trade.total_amount_usdc))} USDC has been returned to your wallet.\n\nTrade: *${trade.trade_number}*\nTx: \`${txSignature.slice(0, 16)}...\`\n\n${tradeUrl(trade.id)}`
  );
}

/**
 * Sent to buyer if proof review window is expiring (48hr reminder)
 */
export async function notifyApprovalReminder(
  buyerId: string | null | undefined,
  buyerChatId: string | null | undefined,
  trade: Trade,
  milestone: Milestone
): Promise<void> {
  await notifyLinkedUser(
    buyerId,
    buyerChatId,
    `⏰ *Approval Reminder*\n\nShipping proof for Milestone ${milestone.milestone_number} on *${trade.trade_number}* is awaiting your review.\n\nApprove or dispute before the 48-hour window closes:\n${tradeUrl(trade.id)}`
  );
}

/**
 * Sent to both parties when a new message arrives in the trade chat
 */
export async function notifyNewMessage(
  recipientUserId: string | null | undefined,
  recipientChatId: string | null | undefined,
  trade: Trade,
  senderName: string
): Promise<void> {
  await notifyLinkedUser(
    recipientUserId,
    recipientChatId,
    `💬 *New Message*\n\n${senderName} sent a message on trade *${trade.trade_number}*.\n\nView on TradeOS:\n${tradeUrl(trade.id)}`
  );
}