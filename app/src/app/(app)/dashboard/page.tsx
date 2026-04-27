//tradeos/app/src/app/(app)/dashboard/page.tsx

"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  ExternalLink,
  Wallet,
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
  const { user } = usePrivy();
  const { trades, loading } = useTrades();

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

  const displayName =
    user?.email?.address?.split("@")[0] ?? "Merchant";

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
