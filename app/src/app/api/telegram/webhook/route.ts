import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram/bot";

// POST /api/telegram/webhook — receives all updates from Telegram
const telegramWebhookHandler = webhookCallback(bot, "std/http");
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }
  }
  return telegramWebhookHandler(req);
}

// GET /api/telegram/webhook?register=true — registers the webhook with Telegram
// Call this once after deploying to production
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shouldRegister = searchParams.get("register") === "true";

  if (!shouldRegister) {
    return NextResponse.json({ ok: true, message: "Webhook endpoint active" });
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_URL is not set" },
      { status: 500 }
    );
  }

  try {
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ["message", "callback_query"],
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    });

    const info = await bot.api.getWebhookInfo();

    return NextResponse.json({
      ok: true,
      message: "Webhook registered",
      webhook_url: info.url,
      pending_update_count: info.pending_update_count,
    });
  } catch (err) {
    console.error("[Telegram] Webhook registration failed:", err);
    return NextResponse.json(
      { error: "Failed to register webhook" },
      { status: 500 }
    );
  }
}