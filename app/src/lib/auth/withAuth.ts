import { NextRequest, NextResponse } from "next/server";
import {
  PrivyClient,
  type LinkedAccount,
  type User as PrivyUser,
} from "@privy-io/node";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

// Standard embedded wallet account type
type PrivyWalletAccount = Extract<LinkedAccount, { type: "wallet" }>;
type PrivyEmailAccount = Extract<LinkedAccount, { type: "email" }>;

// AA wallets don't have a `type` field — they only have chain_type + address
type PrivyAAAccount = LinkedAccount & {
  chain_type?: string;
  address?: string;
};

/**
 * Finds a Solana wallet address from linked accounts.
 * Handles both embedded wallets (type === "wallet", chain_type === "solana")
 * and AA wallets created via email (type is undefined, chain_type === "solana").
 */
function getSolanaWalletAddress(privyUser: PrivyUser): string | undefined {
  const accounts = privyUser.linked_accounts as PrivyAAAccount[];

  // 1. Prefer standard embedded wallet
  const embedded = accounts.find(
    (a) => a.type === "wallet" && a.chain_type === "solana" && a.address
  );
  if (embedded?.address) return embedded.address;

  // 2. Fall back to AA wallet (email-created, type is undefined)
  const aa = accounts.find(
    (a) =>
      a.chain_type === "solana" &&
      a.address != null &&
      a.address.length >= 32
  );
  return aa?.address;
}

function getEmailAddress(privyUser: PrivyUser): string | null {
  return (
    privyUser.linked_accounts.find(
      (account): account is PrivyEmailAccount => account.type === "email"
    )?.address ?? null
  );
}

export type AuthedRequest = NextRequest & {
  user: User;
  walletAddress: string;
};

type RouteParams = Record<string, string>;

type RouteHandler<TParams extends RouteParams = Record<string, never>> = (
  req: AuthedRequest,
  context: { params: TParams }
) => Promise<Response>;

/**
 * Wraps an API route handler with Privy auth verification.
 * Automatically upserts the user record on first visit.
 *
 * Supports both:
 *  - Standard Privy embedded Solana wallets (type === "wallet")
 *  - AA wallets created via email login (type is undefined, chain_type === "solana")
 */
export function withAuth<TParams extends RouteParams = Record<string, never>>(
  handler: RouteHandler<TParams>
) {
  return async (req: NextRequest, context: { params: Promise<TParams> }) => {
    try {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const token = authHeader.replace("Bearer ", "").trim();

      if (!token || token === "undefined" || token === "null") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);

      // Fetch full Privy user to access linked_accounts
      const privyUser = await privy.users()._get(verifiedClaims.user_id);
      const walletAddress = getSolanaWalletAddress(privyUser);
      const email = getEmailAddress(privyUser);

      if (!walletAddress) {
        console.warn("[withAuth] WALLET_NOT_READY", {
          path: req.nextUrl.pathname,
          privyDid: verifiedClaims.user_id,
          accounts: privyUser.linked_accounts.map((a) => ({
            type: a.type,
            chain_type: (a as PrivyAAAccount).chain_type,
            hasAddress: Boolean((a as PrivyAAAccount).address),
          })),
        });
        return NextResponse.json(
          {
            error: "No Solana wallet found for this account yet.",
            code: "WALLET_NOT_READY",
            detail:
              "Please create your embedded Solana wallet and retry this action.",
          },
          { status: 403 }
        );
      }

      const user = await prisma.user.upsert({
        where: { wallet_address: walletAddress },
        create: {
          wallet_address: walletAddress,
          email,
        },
        update: {
          email,
        },
      });

      const authedReq = req as AuthedRequest;
      authedReq.user = user;
      authedReq.walletAddress = walletAddress;

      if (process.env.NODE_ENV === "development") {
        console.log("[withAuth] authenticated", {
          path: req.nextUrl.pathname,
          privyDid: verifiedClaims.user_id,
          walletAddress,
          userId: user.id,
        });
      }

      return handler(authedReq, { params: await context.params });
    } catch (err) {
      console.error("[withAuth] Error:", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  };
}