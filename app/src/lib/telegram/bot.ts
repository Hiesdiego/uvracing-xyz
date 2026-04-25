import { Bot } from "grammy";
import { prisma } from "@/lib/db/prisma";
import { formatUsdc, shortAddress } from "@/lib/utils";
import { TRADE_STATUS_LABELS } from "@/lib/constants";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL, USDC_MINT, USDC_DECIMALS } from "@/lib/constants";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
bot.catch((err) => {
  console.error("[Telegram] Bot error:", err.error);
});

// ─── /start ───────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const args = ctx.message?.text?.split(" ") ?? [];
  const linkToken = args[1]; // /start <linkToken>

  // If a link token was passed, connect this Telegram account to the user
  if (linkToken) {
    if (!/^[a-f0-9]{24}$/.test(linkToken)) {
      await ctx.reply("Invalid or expired connect token. Please reconnect from the app.");
      return;
    }
    const user = await prisma.user.findFirst({
      where: { telegram_username: `pending:${linkToken}` },
    });

    if (user) {
      await prisma.$transaction([
        prisma.user.updateMany({
          where: { telegram_chat_id: chatId, id: { not: user.id } },
          data: { telegram_chat_id: null },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: {
            telegram_chat_id: chatId,
            telegram_username: ctx.from?.username ?? null,
          },
        }),
      ]);

      await ctx.reply(
        `✅ *TradeOS connected*\n\nYou'll now receive trade notifications here.\n\nWallet: \`${shortAddress(user.wallet_address, 6)}\``,
        { parse_mode: "Markdown" }
      );
      return;
    }
  }

  await ctx.reply(
    `👋 *Welcome to TradeOS*\n\nProgrammable trade settlement for West Africa ↔ UAE corridor merchants.\n\nTo connect your account, visit the TradeOS web app and click *Connect Telegram* in your profile.\n\n*Commands:*\n/trades — View your active trades\n/balance — Check your USDC balance\n/help — Show this message`,
    { parse_mode: "Markdown" }
  );
});

// ─── /help ────────────────────────────────────────────────────────────────────

bot.command("help", async (ctx) => {
  await ctx.reply(
    `*TradeOS Commands*\n\n/trades — Your active trades\n/balance — USDC balance\n/help — This message\n\nFor full trade management, visit the web app.`,
    { parse_mode: "Markdown" }
  );
});

// ─── /trades ─────────────────────────────────────────────────────────────────

bot.command("trades", async (ctx) => {
  const chatId = String(ctx.chat.id);

  const user = await prisma.user.findFirst({
    where: { telegram_chat_id: chatId },
  });

  if (!user) {
    await ctx.reply(
      "⚠️ Your Telegram is not connected to a TradeOS account.\n\nVisit the web app to connect."
    );
    return;
  }

  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ buyer_id: user.id }, { supplier_id: user.id }],
      NOT: {
        status: { in: ["completed", "cancelled", "refunded"] },
      },
    },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  if (trades.length === 0) {
    await ctx.reply("You have no active trades.\n\nVisit the web app to start one.");
    return;
  }

  const lines = trades.map((t) => {
    const statusLabel = TRADE_STATUS_LABELS[t.status] ?? t.status;
    return `• *${t.trade_number}* — $${formatUsdc(Number(t.total_amount_usdc))} USDC\n  ${statusLabel}`;
  });

  await ctx.reply(
    `*Your Active Trades*\n\n${lines.join("\n\n")}\n\nView details on the TradeOS web app.`,
    { parse_mode: "Markdown" }
  );
});

// ─── /balance ─────────────────────────────────────────────────────────────────

bot.command("balance", async (ctx) => {
  const chatId = String(ctx.chat.id);

  const user = await prisma.user.findFirst({
    where: { telegram_chat_id: chatId },
  });

  if (!user) {
    await ctx.reply(
      "⚠️ Your Telegram is not connected to a TradeOS account.\n\nVisit the web app to connect."
    );
    return;
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const walletPubkey = new PublicKey(user.wallet_address);
    const mintPubkey = new PublicKey(USDC_MINT);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey },
      "confirmed"
    );
    const raw = tokenAccounts.value.reduce((sum, account) => {
      const amount =
        account.account.data.parsed.info.tokenAmount.amount ?? "0";
      return sum + BigInt(amount);
    }, BigInt(0));
    const balance = Number(raw) / Math.pow(10, USDC_DECIMALS);

    await ctx.reply(
      `💰 *USDC Balance*\n\n\`${formatUsdc(balance)} USDC\`\n\nWallet: \`${shortAddress(user.wallet_address, 6)}\``,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply(
      `💰 *USDC Balance*\n\n\`0.00 USDC\`\n\nWallet: \`${shortAddress(user.wallet_address, 6)}\``,
      { parse_mode: "Markdown" }
    );
  }
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

bot.on("message", async (ctx) => {
  await ctx.reply(
    "Use /help to see available commands, or visit the TradeOS web app for full functionality."
  );
});
