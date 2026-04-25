import { NextRequest, NextResponse } from "next/server";
import { PrivyClient, type LinkedAccount, type User as PrivyUser } from "@privy-io/node";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

type PrivyWalletAccount = Extract<LinkedAccount, { type: "wallet" }>;
type PrivyEmailAccount = Extract<LinkedAccount, { type: "email" }>;

function getWalletAddress(privyUser: PrivyUser) {
  return privyUser.linked_accounts.find(
    (account): account is PrivyWalletAccount => account.type === "wallet"
  )?.address;
}

function getEmailAddress(privyUser: PrivyUser) {
  return privyUser.linked_accounts.find(
    (account): account is PrivyEmailAccount => account.type === "email"
  )?.address;
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
 */
export function withAuth<TParams extends RouteParams = Record<string, never>>(
  handler: RouteHandler<TParams>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<TParams> }
  ) => {
    try {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const token = authHeader.replace("Bearer ", "");
      const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);

      // Fetch the full user record so we can normalize wallet and email fields.
      const privyUser = await privy.users()._get(verifiedClaims.user_id);
      const walletAddress = getWalletAddress(privyUser);
      const email = getEmailAddress(privyUser) ?? null;

      if (!walletAddress) {
        return NextResponse.json(
          { error: "No wallet address found" },
          { status: 400 }
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

      return handler(authedReq, { params: await context.params });
    } catch (err) {
      console.error("[withAuth] Error:", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  };
}
