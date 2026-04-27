import { NextRequest, NextResponse } from "next/server";
import { PrivyClient, type LinkedAccount } from "@privy-io/node";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

/**
 * One PrivyClient instance — creating it per-request is wasteful.
 */
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const privyAppSecret = process.env.PRIVY_APP_SECRET?.trim();

if (!privyAppId || !privyAppSecret) {
  throw new Error(
    "Privy credentials are missing. Ensure NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are set."
  );
}

const privy = new PrivyClient({
  appId: privyAppId,
  appSecret: privyAppSecret,
});

type PrivyLinkedAccount = LinkedAccount & {
  chain_type?: string;
  address?: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadPart = parts[1];
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findSolanaWallet(linkedAccounts: LinkedAccount[]): string | null {
  const accounts = linkedAccounts as PrivyLinkedAccount[];
  // Prefer Privy-embedded Solana wallet (walletClientType === "privy" on client)
  const solana = accounts.find(
    (a) => a.type === "wallet" && a.chain_type === "solana"
  );
  return solana?.address ?? null;
}

async function resolvePrivyUserFromToken(token: string): Promise<{
  privyDid: string;
  linkedAccounts: LinkedAccount[];
  verificationMethod: "verifyAccessToken" | "verifyAuthToken";
}> {
  const decoded = decodeJwtPayload(token);
  try {
    const verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    const privyDid = verifiedClaims.user_id;
    const privyUser = await privy.users().get(privyDid);
    return {
      privyDid,
      linkedAccounts: privyUser.linked_accounts ?? [],
      verificationMethod: "verifyAccessToken",
    };
  } catch (accessErr) {
    try {
      const verifiedAuthClaims = await privy.utils().auth().verifyAuthToken(token);
      const privyDid =
        verifiedAuthClaims.user_id ??
        (typeof decoded?.sub === "string" ? decoded.sub : undefined);
      if (!privyDid) throw accessErr;
      const privyUser = await privy.users().get(privyDid);
      return {
        privyDid,
        linkedAccounts: privyUser.linked_accounts ?? [],
        verificationMethod: "verifyAuthToken",
      };
    } catch {
      throw accessErr;
    }
  }
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
 * Auth flow:
 *  1. Verify JWT signature locally (verifyAccessToken — no network call)
 *  2. Fetch full Privy user via privy.users().get(userId) to get linked_accounts
 *  3. Upsert DB user by wallet_address
 */
export function withAuth<TParams extends RouteParams = Record<string, never>>(
  handler: RouteHandler<TParams>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<TParams> }
  ) => {
    let tokenForDebug: string | null = null;
    try {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const token = authHeader.slice("Bearer ".length).trim();
      tokenForDebug = token;

      if (!token || token === "undefined" || token === "null") {
        console.error("[withAuth] Invalid bearer token value", {
          path: req.nextUrl.pathname,
          tokenPreview: token,
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Step 1/2: verify token and resolve linked accounts
      const { privyDid, linkedAccounts, verificationMethod } =
        await resolvePrivyUserFromToken(token);
      const walletAddress = findSolanaWallet(linkedAccounts);

      if (!walletAddress) {
        console.warn("[withAuth] WALLET_NOT_READY", {
          path: req.nextUrl.pathname,
          privyDid,
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

      // Step 3: upsert by wallet address
      const user = await prisma.user.upsert({
        where: { wallet_address: walletAddress },
        create: {
          wallet_address: walletAddress,
        },
        update: {},
      });

      const authedReq = req as AuthedRequest;
      authedReq.user = user;
      authedReq.walletAddress = walletAddress;

      if (process.env.NODE_ENV === "development") {
        console.log("[withAuth] authenticated", {
          path: req.nextUrl.pathname,
          privyDid,
          verificationMethod,
          walletAddress,
          userId: user.id,
        });
      }

      return handler(authedReq, { params: await context.params });
    } catch (err) {
      const payload = tokenForDebug ? decodeJwtPayload(tokenForDebug) : null;
      console.error("[withAuth] Error:", {
        path: req.nextUrl.pathname,
        message: err instanceof Error ? err.message : String(err),
        privyConfiguredAppId: privyAppId,
        tokenMeta: tokenForDebug
          ? {
              length: tokenForDebug.length,
              parts: tokenForDebug.split(".").length,
            }
          : null,
        decodedClaims: payload
          ? {
              iss: payload.iss,
              aud: payload.aud,
              sub: payload.sub,
              user_id: payload.user_id,
              exp: payload.exp,
              iat: payload.iat,
            }
          : null,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  };
}
