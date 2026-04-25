"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Star,
  TrendingUp,
  TrendingDown,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

type ReputationEvent = {
  id: string;
  event_type: string;
  score_delta: number;
  created_at: string;
  trade: { trade_number: string; goods_description: string };
};

type ReputationSummary = {
  score: string;
  total_trades: number;
  completed_trades: number;
  disputed_trades: number;
  on_time_rate: number;
  events: ReputationEvent[];
};

const EVENT_LABELS: Record<string, string> = {
  trade_completed: "Trade completed",
  trade_completed_late: "Trade completed (late)",
  payment_on_time: "Payment on time",
  dispute_opened: "Dispute raised",
  dispute_ruled_against: "Dispute ruled against you",
  dispute_ruled_in_favor: "Dispute ruled in your favour",
  trade_cancelled_before_shipment: "Trade cancelled before shipment",
  trade_cancelled_after_funding: "Trade cancelled after funding",
};

function ScoreRing({ score }: { score: number }) {
  const pct = ((score - 1) / 4) * 100; // 1–5 mapped to 0–100%
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (pct / 100) * circumference;

  const color =
    score >= 4.5
      ? "#F5A623"
      : score >= 3.5
      ? "#60A5FA"
      : score >= 2.5
      ? "#FBBF24"
      : "#F87171";

  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="hsl(222 30% 14%)"
          strokeWidth="8"
        />
        {/* Progress */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="text-center z-10">
        <p className="text-3xl font-bold font-mono" style={{ color }}>
          {score.toFixed(1)}
        </p>
        <p className="text-[10px] text-muted-foreground">out of 5.0</p>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="trade-card flex items-center gap-3">
      <div
        className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0",
          color
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold font-mono">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function ReputationPage() {
  const { user, getAccessToken } = usePrivy();
  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await getAccessToken();
        if (!token || !user) return;

        // Get the current user's DB id first
        const meRes = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const me = await meRes.json();

        const res = await fetch(`/api/users/${me.id}/reputation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setSummary(await res.json());
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [user, getAccessToken]);

  return (
    <div className="max-w-2xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Reputation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your trust score across all TradeOS trades
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : !summary ? (
        <div className="trade-card text-center py-12">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Complete your first trade to start building your reputation score.
          </p>
        </div>
      ) : (
        <>
          {/* Score card */}
          <div className="trade-card flex flex-col sm:flex-row items-center gap-8">
            <ScoreRing score={Number(summary.score)} />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-semibold mb-1">
                {Number(summary.score) >= 4.5
                  ? "Excellent — Highly trusted merchant"
                  : Number(summary.score) >= 3.5
                  ? "Good — Reliable track record"
                  : Number(summary.score) >= 2.5
                  ? "Fair — Room to improve"
                  : "Poor — Needs attention"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                Score is weighted toward your last 20 trades. Complete trades
                on time and avoid disputes to improve your score.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatPill
              label="Total Trades"
              value={summary.total_trades}
              icon={ArrowLeftRight}
              color="bg-[hsl(var(--gold)/0.1)] text-gold"
            />
            <StatPill
              label="Completed"
              value={summary.completed_trades}
              icon={CheckCircle2}
              color="bg-green-500/10 text-green-400"
            />
            <StatPill
              label="Disputes"
              value={summary.disputed_trades}
              icon={AlertTriangle}
              color="bg-red-400/10 text-red-400"
            />
            <StatPill
              label="On-time Rate"
              value={`${summary.on_time_rate}%`}
              icon={Shield}
              color="bg-blue-500/10 text-blue-400"
            />
          </div>

          {/* Event history */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Score History
            </h2>

            {summary.events.length === 0 ? (
              <div className="trade-card text-center py-8">
                <p className="text-sm text-muted-foreground">
                  No events yet — your history will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {summary.events.map((event) => {
                  const delta = Number(event.score_delta);
                  const positive = delta >= 0;

                  return (
                    <div
                      key={event.id}
                      className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
                            positive
                              ? "bg-green-500/10"
                              : "bg-red-400/10"
                          )}
                        >
                          {positive ? (
                            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {EVENT_LABELS[event.event_type] ?? event.event_type}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {event.trade.trade_number} ·{" "}
                            {formatDate(event.created_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-mono font-bold",
                          positive ? "text-green-400" : "text-red-400"
                        )}
                      >
                        {positive ? "+" : ""}
                        {delta.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}