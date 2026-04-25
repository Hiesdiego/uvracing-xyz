import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { randomBytes } from "crypto";

// POST /api/users/connect-telegram
// Generates a one-time link token and returns a Telegram deep link.
// The user clicks the link → opens the bot → /start <token> fires
// → bot matches token to user and saves the chat_id.
export const POST = withAuth(async (req: AuthedRequest) => {
  // Generate a short random token
  const token = randomBytes(12).toString("hex");

  // Store token temporarily in telegram_username field prefixed with "pending:"
  // The bot clears this once the user connects
  await prisma.user.update({
    where: { id: req.user.id },
    data: { telegram_username: `pending:${token}` },
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME is not set" },
      { status: 500 }
    );
  }

  const deepLink = `https://t.me/${botUsername}?start=${token}`;

  return NextResponse.json({ deep_link: deepLink, token });
});

// DELETE /api/users/connect-telegram — disconnect Telegram
export const DELETE = withAuth(async (req: AuthedRequest) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      telegram_chat_id: null,
      telegram_username: null,
    },
  });

  return NextResponse.json({ ok: true });
});