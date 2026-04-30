//tradeos/app/src/app/(app)/dashboard/page.tsx

"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Download,
  Wallet,
  Landmark,
  Scale,
} from "lucide-react";
import { useTrades } from "@/hooks/useTrade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatUsdc,
  shortAddress,
  formatDate,
  solscanAccountUrl,
} from "@/lib/utils";
import {
  TRADE_STATUS_LABELS,
  TRADE_STATUS_COLORS,
} from "@/lib/constants";
import type { Trade } from "@/types";

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="trade-card flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className="w-9 h-9 rounded-md bg-[hsl(var(--gold)/0.1)] border border-[hsl(var(--gold)/0.2)] flex items-center justify-center">
        <Icon className="w-4 h-4 text-gold" />
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuyer = true; // will refine with user context
  const statusLabel = TRADE_STATUS_LABELS[trade.status] ?? trade.status;
  const statusColor = TRADE_STATUS_COLORS[trade.status] ?? "text-muted-foreground";
  const pendingMilestone = trade.milestones?.find(
    (m) => m.status === "proof_uploaded"
  );

  return (
    <Link
      href={`/trades/${trade.id}`}
      className="flex items-center justify-between px-4 py-3 rounded-md border border-border hover:border-[hsl(var(--gold)/0.3)] hover:bg-secondary/30 transition-all duration-150 group"
    >
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold font-mono">
              {trade.trade_number}
            </span>
            {pendingMilestone && (
              <Badge variant="outline" className="text-[10px] text-gold border-gold/40 py-0">
                Action needed
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
            {trade.goods_description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-mono font-semibold">
            ${formatUsdc(Number(trade.total_amount_usdc))}
          </p>
          <p className="text-[10px] text-muted-foreground">USDC</p>
        </div>
        <div className="text-right hidden md:block">
          <p className={`text-xs font-medium ${statusColor}`}>{statusLabel}</p>
          <p className="text-[10px] text-muted-foreground">
            {formatDate(trade.created_at)}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-gold transition-colors" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, getAccessToken } = usePrivy();
  const { trades, loading } = useTrades();
  const [risk, setRisk] = useState<{
    my_risk?: { score: number; tier: "low" | "medium" | "high" };
  } | null>(null);

  const activeTrades = trades.filter(
    (t) =>
      !["completed", "cancelled", "refunded"].includes(t.status)
  );
  const pendingAction = trades.filter(
    (t) =>
      t.milestones?.some((m) => m.status === "proof_uploaded") ||
      t.status === "pending_funding"
  );
  const totalEscrowed = trades.reduce((sum, trade) => {
    const statusHasLockedEscrow = [
      "funded",
      "in_progress",
      "milestone_1_released",
      "milestone_2_released",
      "disputed",
    ].includes(trade.status);

    if (!statusHasLockedEscrow) {
      return sum;
    }

    const releasedAmount =
      trade.milestones?.reduce((releasedSum, milestone) => {
        if (milestone.status !== "released") return releasedSum;
        return (
          releasedSum +
          (Number(trade.total_amount_usdc) * milestone.release_percentage) / 100
        );
      }, 0) ?? 0;

    const lockedAmount = Math.max(
      0,
      Number(trade.total_amount_usdc) - releasedAmount
    );
    return sum + lockedAmount;
  }, 0);
  const completedTrades = trades.filter((t) => t.status === "completed");
  const settledVolume = trades
    .filter((t) => ["completed", "in_progress", "milestone_1_released", "milestone_2_released"].includes(t.status))
    .reduce((sum, t) => sum + Number(t.total_amount_usdc), 0);
  const disputedExposure = trades
    .filter((t) => t.status === "disputed")
    .reduce((sum, t) => sum + Number(t.total_amount_usdc), 0);
  const refundedVolume = trades
    .filter((t) => t.status === "refunded")
    .reduce((sum, t) => sum + Number(t.total_amount_usdc), 0);
  const releasedVolume = trades.reduce((sum, trade) => {
    const released =
      trade.milestones?.reduce((acc, m) => {
        if (m.status !== "released") return acc;
        return acc + (Number(trade.total_amount_usdc) * m.release_percentage) / 100;
      }, 0) ?? 0;
    return sum + released;
  }, 0);
  const netRealizedFlow = releasedVolume - refundedVolume;
  const avgDaysToRelease = (() => {
    const values = trades.flatMap((trade) =>
      (trade.milestones ?? [])
        .filter((m) => m.released_at)
        .map((m) => {
          const created = new Date(trade.created_at).getTime();
          const released = new Date(m.released_at as string).getTime();
          if (!Number.isFinite(created) || !Number.isFinite(released)) return null;
          const days = (released - created) / (1000 * 60 * 60 * 24);
          return days >= 0 ? days : null;
        })
        .filter((v): v is number => v != null)
    );
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  })();

  const displayName =
    user?.email?.address?.split("@")[0] ?? "Merchant";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/treasury/risk", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRisk(data);
      } catch {
        // noop
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  async function exportTreasuryCsv() {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch("/api/treasury/export", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradeos_treasury_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back,{" "}
            <span className="text-gold">{displayName}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            West Africa {"<->"} UAE Corridor
          </p>
        </div>
        <Button
          asChild
          className="gradient-gold text-black font-semibold text-sm hover:opacity-90 glow-gold"
        >
          <Link href="/trades/new">
            <PlusCircle className="w-4 h-4 mr-2" />
            New Trade
          </Link>
        </Button>
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={exportTreasuryCsv}
          className="text-xs"
        >
          <Download className="w-3 h-3 mr-1.5" />
          Export Treasury CSV
        </Button>
      </div>
      {risk?.my_risk && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="border-red-400/30">
            Anti-Fraud Score: {risk.my_risk.score}/100
          </Badge>
          <Badge
            variant="outline"
            className={
              risk.my_risk.tier === "high"
                ? "border-red-400/40 text-red-300"
                : risk.my_risk.tier === "medium"
                ? "border-yellow-400/40 text-yellow-300"
                : "border-green-400/40 text-green-300"
            }
          >
            Risk Tier: {risk.my_risk.tier}
          </Badge>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))
        ) : (
          <>
            <StatCard
              label="Active Trades"
              value={activeTrades.length}
              icon={ArrowLeftRight}
              sub="in progress"
            />
            <StatCard
              label="In Escrow"
              value={`$${formatUsdc(totalEscrowed)}`}
              icon={Wallet}
              sub="USDC locked"
            />
            <StatCard
              label="Pending Action"
              value={pendingAction.length}
              icon={Clock}
              sub="need your review"
            />
            <StatCard
              label="Completed"
              value={completedTrades.length}
              icon={CheckCircle2}
              sub="all time"
            />
          </>
        )}
      </div>

      {/* Treasury */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Treasury Dashboard
          </h2>
          <Badge variant="outline" className="text-[10px] border-[hsl(var(--gold)/0.3)] text-gold">
            Merchant Finance
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <StatCard
            label="Settled Volume"
            value={`$${formatUsdc(settledVolume)}`}
            icon={Landmark}
            sub="completed + released trade flow"
          />
          <StatCard
            label="Released to Suppliers"
            value={`$${formatUsdc(releasedVolume)}`}
            icon={TrendingUp}
            sub="milestone payouts"
          />
          <StatCard
            label="Refunded to Buyers"
            value={`$${formatUsdc(refundedVolume)}`}
            icon={TrendingDown}
            sub="capital returned"
          />
          <StatCard
            label="Disputed Exposure"
            value={`$${formatUsdc(disputedExposure)}`}
            icon={Scale}
            sub="value currently disputed"
          />
          <StatCard
            label="Net Realized Flow"
            value={`$${formatUsdc(netRealizedFlow)}`}
            icon={ArrowLeftRight}
            sub="released minus refunded"
          />
          <StatCard
            label="Avg Milestone Release"
            value={`${avgDaysToRelease.toFixed(1)}d`}
            icon={Clock}
            sub="trade create -> milestone release"
          />
        </div>
      </div>

      {/* Pending actions banner */}
      {!loading && pendingAction.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.05)]">
          <AlertTriangle className="w-4 h-4 text-gold flex-shrink-0" />
          <p className="text-sm text-gold">
            {pendingAction.length} trade
            {pendingAction.length > 1 ? "s" : ""} need your attention -
            proof uploaded or funding required.
          </p>
        </div>
      )}

      {/* Recent trades */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Trades
          </h2>
          <Link
            href="/trades"
            className="text-xs text-gold hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="trade-card text-center py-12">
            <ArrowLeftRight className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No trades yet.{" "}
              <Link href="/trades/new" className="text-gold hover:underline">
                Start your first trade
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.slice(0, 6).map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
