import type { Dispute, Milestone, Trade } from "@/types";

export type RiskTier = "low" | "medium" | "high";

export type FraudRiskProfile = {
  score: number; // 0..100, higher is riskier
  tier: RiskTier;
  metrics: {
    totalTrades: number;
    disputedTrades: number;
    disputeRate: number;
    proofRejections: number;
    releasedMilestones: number;
    rejectionRate: number;
    refundedTrades: number;
    completionRate: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeFraudRiskProfile(input: {
  trades: Array<
    Trade & {
      milestones?: Milestone[];
      disputes?: Dispute[];
    }
  >;
  userId: string;
}): FraudRiskProfile {
  const trades = input.trades;
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      score: 10,
      tier: "low",
      metrics: {
        totalTrades: 0,
        disputedTrades: 0,
        disputeRate: 0,
        proofRejections: 0,
        releasedMilestones: 0,
        rejectionRate: 0,
        refundedTrades: 0,
        completionRate: 0,
      },
    };
  }

  const disputedTrades = trades.filter((t) => (t.disputes?.length ?? 0) > 0).length;
  const proofRejections = trades.reduce(
    (sum, t) =>
      sum +
      (t.milestones?.filter((m) => Boolean(m.proof_rejection_reason)).length ?? 0),
    0
  );
  const releasedMilestones = trades.reduce(
    (sum, t) => sum + (t.milestones?.filter((m) => m.status === "released").length ?? 0),
    0
  );
  const refundedTrades = trades.filter((t) => t.status === "refunded").length;
  const completedTrades = trades.filter((t) => t.status === "completed").length;

  const disputeRate = disputedTrades / totalTrades;
  const rejectionRate = releasedMilestones > 0 ? proofRejections / releasedMilestones : 0;
  const completionRate = completedTrades / totalTrades;

  // Weighted heuristic model
  const rawScore =
    100 *
    (disputeRate * 0.45 +
      rejectionRate * 0.3 +
      (refundedTrades / totalTrades) * 0.15 +
      (1 - completionRate) * 0.1);

  const score = Math.round(clamp(rawScore, 0, 100));
  const tier: RiskTier = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return {
    score,
    tier,
    metrics: {
      totalTrades,
      disputedTrades,
      disputeRate,
      proofRejections,
      releasedMilestones,
      rejectionRate,
      refundedTrades,
      completionRate,
    },
  };
}
