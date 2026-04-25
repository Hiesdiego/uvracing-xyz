import { NextRequest, NextResponse } from "next/server";
import {
  withAuth,
  type AuthedRequest,
} from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { safeJson, validationErrorResponse } from "@/lib/api/validation";
import {
  PrivyClient,
  type LinkedAccount,
  type User as PrivyUser,
} from "@privy-io/node";

type Context = { params: { tradeId: string } };
type GetContext = { params: Promise<{ tradeId: string }> };

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

type PrivyWalletAccount = Extract<LinkedAccount, { type: "wallet" }>;

function getWalletAddress(privyUser: PrivyUser) {
  return privyUser.linked_accounts.find(
    (account): account is PrivyWalletAccount => account.type === "wallet"
  )?.address;
}

async function getOptionalAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    const privyUser = await privy.users()._get(verifiedClaims.user_id);
    const walletAddress = getWalletAddress(privyUser);
    if (!walletAddress) {
      return null;
    }

    const user = await prisma.user.upsert({
      where: { wallet_address: walletAddress },
      create: {
        wallet_address: walletAddress,
      },
      update: {},
    });
    return user;
  } catch {
    return null;
  }
}

// GET /api/trades/[tradeId] - fetch a single trade with all relations
export async function GET(req: NextRequest, ctx: GetContext) {
  const { tradeId } = await ctx.params;
  const authedUser = await getOptionalAuthedUser(req);

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      buyer: true,
      supplier: true,
      milestones: { orderBy: { milestone_number: "asc" } },
      disputes: {
        include: { raiser: true },
        orderBy: { created_at: "desc" },
      },
      receipt: true,
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  // Only buyer or supplier can view the trade.
  const isMember =
    authedUser !== null &&
    (trade.buyer_id === authedUser.id || trade.supplier_id === authedUser.id);

  if (!isMember) {
    const inviteToken = new URL(req.url).searchParams.get("invite_token");
    const isValidInviteView =
      trade.status === "pending_supplier" &&
      !!inviteToken &&
      inviteToken === trade.supplier_invite_token;

    if (!isValidInviteView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    ...trade,
    supplier_invite_link: trade.supplier_invite_token
      ? `${process.env.NEXT_PUBLIC_APP_URL}/trades/${trade.id}?invite_token=${trade.supplier_invite_token}`
      : null,
  });
}

// PATCH /api/trades/[tradeId] - guarded updates only
export const PATCH = withAuth(async (req: AuthedRequest, ctx: Context) => {
  try {
    const { tradeId } = ctx.params;
    const body = await safeJson<Record<string, unknown>>(req);
    const status = typeof body.status === "string" ? body.status : undefined;
    const escrowPubkeyRequested = typeof body.escrow_pubkey === "string";
    const supplierIdRequested = typeof body.supplier_id === "string";

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const isMember =
      trade.buyer_id === req.user.id || trade.supplier_id === req.user.id;
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (escrowPubkeyRequested || supplierIdRequested) {
      return NextResponse.json(
        {
          error:
            "Direct escrow/supplier updates are disabled. Use dedicated endpoints.",
        },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: "No supported fields to update" },
        { status: 400 }
      );
    }

    // Guardrail: only buyers can cancel pre-funded trades from this generic endpoint.
    if (status !== "cancelled") {
      return NextResponse.json(
        {
          error:
            "Status changes are restricted. Use dedicated trade action endpoints.",
        },
        { status: 400 }
      );
    }
    if (req.user.id !== trade.buyer_id) {
      return NextResponse.json(
        { error: "Only the buyer can cancel this trade" },
        { status: 403 }
      );
    }
    if (![
      "pending_supplier",
      "pending_funding",
    ].includes(trade.status)) {
      return NextResponse.json(
        {
          error:
            "Only trades awaiting supplier/funding can be cancelled from this endpoint",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.trade.update({
      where: { id: tradeId },
      data: { status: "cancelled" },
      include: {
        buyer: true,
        supplier: true,
        milestones: { orderBy: { milestone_number: "asc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return validationErrorResponse(error);
  }
});
