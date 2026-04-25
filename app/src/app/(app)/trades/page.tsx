"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle, ArrowRight, ArrowLeftRight, Search } from "lucide-react";
import { useTrades } from "@/hooks/useTrade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatUsdc,
  formatDate,
} from "@/lib/utils";
import {
  TRADE_STATUS_LABELS,
  TRADE_STATUS_COLORS,
} from "@/lib/constants";
import type { Trade } from "@/types";

const STATUS_FILTERS = [
  { value: "all", label: "All Trades" },
  { value: "active", label: "Active" },
  { value: "pending_supplier", label: "Awaiting Supplier" },
  { value: "pending_funding", label: "Awaiting Funding" },
  { value: "funded", label: "Funded" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
];

function TradeCard({ trade }: { trade: Trade }) {
  const statusLabel = TRADE_STATUS_LABELS[trade.status] ?? trade.status;
  const statusColor = TRADE_STATUS_COLORS[trade.status] ?? "text-muted-foreground";
  const releasedMilestones =
    trade.milestones?.filter((m) => m.status === "released").length ?? 0;
  const totalMilestones = trade.milestones?.length ?? 0;
  const progress =
    totalMilestones > 0
      ? Math.round((releasedMilestones / totalMilestones) * 100)
      : 0;

  return (
    <Link
      href={`/trades/${trade.id}`}
      className="trade-card group flex flex-col gap-4 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold">
              {trade.trade_number}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {trade.corridor}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {trade.goods_description}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {/* Progress bar */}
      {totalMilestones > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {releasedMilestones}/{totalMilestones} milestones
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-mono font-bold">
            ${formatUsdc(Number(trade.total_amount_usdc))}
            <span className="text-xs text-muted-foreground font-normal ml-1">
              USDC
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatDate(trade.created_at)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function TradesPage() {
  const { trades, loading } = useTrades();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = trades.filter((t) => {
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? !["completed", "cancelled", "refunded"].includes(t.status)
        : t.status === statusFilter;

    const matchesSearch =
      search === ""
        ? true
        : t.trade_number.toLowerCase().includes(search.toLowerCase()) ||
          t.goods_description.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trades</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {trades.length} total trade{trades.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          asChild
          className="gradient-gold text-black font-semibold text-sm hover:opacity-90"
        >
          <Link href="/trades/new">
            <PlusCircle className="w-4 h-4 mr-2" />
            New Trade
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search trades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-input border-border pl-9 text-sm h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-input border-border h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trade grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="trade-card text-center py-16">
          <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            {search || statusFilter !== "all"
              ? "No trades match your filters"
              : "No trades yet"}
          </p>
          {!search && statusFilter === "all" && (
            <Button asChild size="sm" className="gradient-gold text-black font-semibold hover:opacity-90">
              <Link href="/trades/new">Start your first trade</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((trade) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}