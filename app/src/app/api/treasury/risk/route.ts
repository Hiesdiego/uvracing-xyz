import { NextResponse } from "next/server";
import { withAuth, type AuthedRequest } from "@/lib/auth/withAuth";
import { prisma } from "@/lib/db/prisma";
import { computeFraudRiskProfile } from "@/lib/risk";

export const GET = withAuth(async (req: AuthedRequest) => {
  const myTrades = await prisma.trade.findMany({
    where: {
      OR: [{ buyer_id: req.user.id }, { supplier_id: req.user.id }],
    },
    include: {
      milestones: { orderBy: { milestone_number: "asc" } },
      disputes: { orderBy: { created_at: "asc" } },
    },
  });

  const myRisk = computeFraudRiskProfile({
    trades: myTrades,
    userId: req.user.id,
  });

  const counterpartyIds = Array.from(
    new Set(
      myTrades
        .map((t) => (t.buyer_id === req.user.id ? t.supplier_id : t.buyer_id))
        .filter((id): id is string => Boolean(id))
    )
  );

  const counterparties = await prisma.user.findMany({
    where: { id: { in: counterpartyIds } },
    select: { id: true, wallet_address: true, display_name: true },
  });

  const counterpartyRisk = await Promise.all(
    counterparties.map(async (cp) => {
      const cpTrades = await prisma.trade.findMany({
        where: {
          OR: [{ buyer_id: cp.id }, { supplier_id: cp.id }],
        },
        include: { milestones: true, disputes: true },
      });
      const profile = computeFraudRiskProfile({ trades: cpTrades, userId: cp.id });
      return {
        user_id: cp.id,
        wallet_address: cp.wallet_address,
        display_name: cp.display_name,
        ...profile,
      };
    })
  );

  return NextResponse.json({
    my_risk: myRisk,
    counterparties: counterpartyRisk,
    generated_at: new Date().toISOString(),
  });
});
