import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";

// GET /api/wallet/transactions
// Builds a transaction history from milestone events where the user
// was the buyer (outbound escrow) or supplier (inbound release).
export const GET = withAuth(async (req: AuthedRequest) => {
  const userId = req.user.id;

  // Get all milestones where user's trades had a release
  const [buyerMilestones, supplierMilestones] = await Promise.all([
    // Trades where user is buyer — outbound (funds locked into escrow)
    prisma.milestone.findMany({
      where: {
        trade: { buyer_id: userId },
        status: "released",
      },
      include: {
        trade: {
          select: {
            id: true,
            trade_number: true,
            total_amount_usdc: true,
          },
        },
      },
      orderBy: { released_at: "desc" },
    }),

    // Trades where user is supplier — inbound (funds received)
    prisma.milestone.findMany({
      where: {
        trade: { supplier_id: userId },
        status: "released",
      },
      include: {
        trade: {
          select: {
            id: true,
            trade_number: true,
            total_amount_usdc: true,
          },
        },
      },
      orderBy: { released_at: "desc" },
    }),
  ]);

  const events = [
    ...buyerMilestones.map((m) => ({
      trade_number: m.trade.trade_number,
      trade_id: m.trade.id,
      milestone_number: m.milestone_number,
      direction: "out" as const,
      amount_usdc:
        (Number(m.trade.total_amount_usdc) * m.release_percentage) / 100,
      tx_signature: m.tx_signature,
      released_at: m.released_at?.toISOString() ?? new Date(0).toISOString(),
      description: m.description,
    })),
    ...supplierMilestones.map((m) => ({
      trade_number: m.trade.trade_number,
      trade_id: m.trade.id,
      milestone_number: m.milestone_number,
      direction: "in" as const,
      amount_usdc:
        (Number(m.trade.total_amount_usdc) * m.release_percentage) / 100,
      tx_signature: m.tx_signature,
      released_at: m.released_at?.toISOString() ?? new Date(0).toISOString(),
      description: m.description,
    })),
  ];

  // Sort by date descending
  events.sort(
    (a, b) =>
      new Date(b.released_at).getTime() - new Date(a.released_at).getTime()
  );

  return NextResponse.json(events);
});