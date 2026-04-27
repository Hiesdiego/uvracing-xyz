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
} from "@privy-io/node";

type Context = { params: { tradeId: string } };
type GetContext = { params: Promise<{ tradeId: string }> };

/**
 * Single PrivyClient instance — reused across requests.
 * JWT verification is local (no network). Creating this per-request is wasteful.
 */
const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

type PrivyLinkedAccount = LinkedAccount & {
  chain_type?: string;
  address?: string;
};

function findSolanaWallet(linkedAccounts: LinkedAccount[]): string | null {
  const accounts = linkedAccounts as PrivyLinkedAccount[];
  const solana = accounts.find(
    (a) => a.type === "wallet" && a.chain_type === "solana"
  );
  return solana?.address ?? null;
}

async function resolveOptionalAuthWallet(token: string) {
  const decoded = (() => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const payloadPart = parts[1];
      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "="
      );
      return JSON.parse(
        Buffer.from(padded, "base64").toString("utf8")
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  try {
    const verifiedClaims = await privy
      .utils()
      .auth()
      .verifyAccessToken(token);
    const privyDid = verifiedClaims.user_id;
    const privyUser = await privy.users().get(privyDid);
    return {
      privyDid,
      walletAddress: findSolanaWallet(privyUser.linked_accounts ?? []),
      verificationMethod: "verifyAccessToken" as const,
    };
  } catch {
    const verifiedAuthClaims = await privy
      .utils()
      .auth()
      .verifyAuthToken(token);
    const privyDid =
      verifiedAuthClaims.user_id ??
      (typeof decoded?.sub === "string" ? decoded.sub : undefined);
    if (!privyDid) {
      return {
        privyDid: undefined,
        walletAddress: null,
        verificationMethod: "verifyAuthToken" as const,
      };
    }
    const privyUser = await privy.users().get(privyDid);
    return {
      privyDid,
      walletAddress: findSolanaWallet(privyUser.linked_accounts ?? []),
      verificationMethod: "verifyAuthToken" as const,
    };
  }
}

async function getOptionalAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.replace("Bearer ", "");
    const { privyDid, walletAddress, verificationMethod } =
      await resolveOptionalAuthWallet(token);

    if (!walletAddress) {
      console.warn("[GET /api/trades/[tradeId]] optional auth missing wallet", {
        path: req.nextUrl.pathname,
        privyDid,
      });
      return null;
    }

    const user = await prisma.user.upsert({
      where: { wallet_address: walletAddress },
      create: { wallet_address: walletAddress },
      update: {},
    });
    if (process.env.NODE_ENV === "development") {
      console.log("[GET /api/trades/[tradeId]] optional auth resolved", {
        privyDid,
        verificationMethod,
        walletAddress,
        userId: user.id,
      });
    }
    return user;
  } catch {
    return null;
  }
}

// GET /api/trades/[tradeId] — fetch a single trade with all relations
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

// PATCH /api/trades/[tradeId] — guarded updates only
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
    if (!["pending_supplier", "pending_funding"].includes(trade.status)) {
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
