import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

const SCORE_MAX = new Prisma.Decimal(5.0);
const SCORE_MIN = new Prisma.Decimal(1.0);

/**
 * Score deltas for every reputation event type.
 * Keep this as the single source of truth — never hardcode deltas elsewhere.
 */
export const REPUTATION_DELTAS: Record<string, number> = {
  trade_completed: 0.1,
  trade_completed_late: 0.05,
  payment_on_time: 0.05,
  dispute_opened: -0.3,
  dispute_ruled_against: -0.5,
  dispute_ruled_in_favor: 0.1,
  trade_cancelled_before_shipment: -0.05,
  trade_cancelled_after_funding: -0.15,
};

/**
 * Records a reputation event and recalculates the user's score.
 * Uses the last 20 trades weighted 2x for recency bias.
 */
export async function applyReputationEvent({
  userId,
  tradeId,
  eventType,
  scoreDelta,
}: {
  userId: string;
  tradeId: string;
  eventType: string;
  scoreDelta: number;
}): Promise<void> {
  // Record the event
  await prisma.reputationEvent.create({
    data: {
      user_id: userId,
      trade_id: tradeId,
      event_type: eventType,
      score_delta: new Prisma.Decimal(scoreDelta),
    },
  });

  // Recalculate score from all events with recency weighting
  await recalculateScore(userId);
}

/**
 * Recalculates a user's reputation score from their full event history.
 * Last 20 events are weighted 2x. Score is clamped to [1.0, 5.0].
 */
async function recalculateScore(userId: string): Promise<void> {
  const allEvents = await prisma.reputationEvent.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });

  if (allEvents.length === 0) return;

  let weightedSum = new Prisma.Decimal(5.0); // Start from base score

  allEvents.forEach((event, index) => {
    const weight = index < 20 ? 2 : 1; // Recent events weighted 2x
    weightedSum = weightedSum.add(
      new Prisma.Decimal(event.score_delta).mul(weight)
    );
  });

  // Normalise by total weight
  const totalWeight = Math.min(allEvents.length, 20) * 2 +
    Math.max(0, allEvents.length - 20);
  const normalised = weightedSum.div(new Prisma.Decimal(totalWeight + 1));

  // Clamp to [1.0, 5.0]
  const clamped = Prisma.Decimal.max(
    SCORE_MIN,
    Prisma.Decimal.min(SCORE_MAX, normalised)
  );

  await prisma.user.update({
    where: { id: userId },
    data: { reputation_score: clamped },
  });
}

/**
 * Returns a user's full reputation summary with event history.
 */
export async function getReputationSummary(userId: string) {
  const [user, events] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        reputation_score: true,
        total_trades: true,
        completed_trades: true,
        disputed_trades: true,
      },
    }),
    prisma.reputationEvent.findMany({
      where: { user_id: userId },
      include: {
        trade: {
          select: { trade_number: true, goods_description: true },
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
  ]);

  if (!user) return null;

  const onTimeRate =
    user.total_trades > 0
      ? Math.round(
          ((user.completed_trades - user.disputed_trades) /
            user.total_trades) *
            100
        )
      : 100;

  return {
    score: Number(user.reputation_score).toFixed(1),
    total_trades: user.total_trades,
    completed_trades: user.completed_trades,
    disputed_trades: user.disputed_trades,
    on_time_rate: onTimeRate,
    events,
  };
}
