import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { getReputationSummary } from "@/lib/reputation";

type Context = { params: { userId: string } };

// GET /api/users/[userId]/reputation
export const GET = withAuth(async (req: AuthedRequest, ctx: Context) => {
  const { userId } = ctx.params;

  const summary = await getReputationSummary(userId);

  if (!summary) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
});