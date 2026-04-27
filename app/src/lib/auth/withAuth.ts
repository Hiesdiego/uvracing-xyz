import { NextRequest, NextResponse } from "next/server";
import { PrivyClient, type LinkedAccount } from "@privy-io/node";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

/**
 * One PrivyClient instance — creating it per-request is wasteful.
 * The JWT verification is local (no network); only upsert hits the DB.
 */
const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

// ---------------------------------------------------------------------------
// extractWalletFromClaims
//
// FIX: The original code called `privy.users()._get(userId)` — a private,
// undocumented method — to fetch the user's wallet address from Privy's API.
// That HTTP call was timing out at ~57 seconds and causing:
//   • P1017 "Server has closed the connection" (Prisma waited on a stale socket)
//   • Random 401/403 responses (the _get call failed or timed out silently)
//
// The wallet address is already embedded in Privy's access token JWT.
// `verifyAccessToken` decodes and verifies the JWT locally — no network call.
// The returned claims object contains `linked_accounts` with all wallets.
// We extract it there instead of making a second round-trip to Privy's API.
// ---------------------------------------------------------------------------
type PrivyLinkedAccount = LinkedAccount & { chain_type?: string };

function extractWalletFromClaims(claims: Record<string, unknown>): string | null {
  // Privy v3 access tokens embed linked_accounts in the JWT payload.
  const linked = claims.linked_accounts as PrivyLinkedAccount[] | undefined;
  if (!linked || !Array.isArray(linked)) return null;

  // Prefer the Solana wallet; fall back to any wallet account.
  const solana = linked.find(
    (a) => a.type === "wallet" && (a as {chain_type?: string}).chain_type === "solana"
  );
  if (solana && "address" in solana) return (solana as {address: string}).address;

  const anyWallet = linked.find((a) => a.type === "wallet");
  if (anyWallet && "address" in anyWallet) return (anyWallet as {address: string}).address;

  return null;
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
 * Auth flow (all local / DB — no external Privy API calls):
 *  1. Verify JWT signature locally via privy.utils().auth().verifyAccessToken()
 *  2. Extract wallet address from JWT claims (linked_accounts)
 *  3. Upsert user in our DB
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

      // Step 1: verify JWT locally — fast, no network call
      const verifiedClaims = await privy
        .utils()
        .auth()
        .verifyAccessToken(token);

      // Step 2: extract wallet from JWT payload — no Privy API call needed
      const walletAddress = extractWalletFromClaims(
        verifiedClaims as unknown as Record<string, unknown>
      );

      if (!walletAddress) {
        console.warn(
          "[withAuth] No wallet address found in JWT claims for user:",
          verifiedClaims.userId ?? verifiedClaims.user_id
        );
        return NextResponse.json(
          { error: "No wallet address found in token" },
          { status: 400 }
        );
      }

      // Step 3: upsert user in our DB
      const user = await prisma.user.upsert({
        where: { wallet_address: walletAddress },
        create: { wallet_address: walletAddress },
        update: {},
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