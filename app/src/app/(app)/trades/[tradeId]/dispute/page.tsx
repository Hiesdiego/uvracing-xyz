"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { useTradeDetail, useTradeActions } from "@/hooks/useTrade";
import { useEscrow } from "@/hooks/useEscrow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DISPUTE_REASON_PRESETS = [
  "Wrong quantity delivered",
  "Goods quality mismatch",
  "Shipment damaged in transit",
  "Delivery timeline breach",
];

export default function TradeDisputePage({
  params,
}: {
  params: Promise<{ tradeId: string }>;
}) {
  const { tradeId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const preselectedMilestone = Number(searchParams.get("milestone"));

  const { trade, loading } = useTradeDetail(tradeId);
  const { openDispute, loading: apiLoading } = useTradeActions();
  const { handleRaiseDispute, loading: chainLoading } = useEscrow();

  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const [milestoneNumber, setMilestoneNumber] = useState<number | null>(null);

  const actionLoading = apiLoading || chainLoading;

  const milestones = useMemo(
    () => trade?.milestones?.map((m) => m.milestone_number) ?? [],
    [trade]
  );

  const effectiveMilestone =
    milestoneNumber ??
    (Number.isFinite(preselectedMilestone) && preselectedMilestone > 0
      ? preselectedMilestone
      : milestones[0] ?? null);

  async function submitDispute() {
    const reasonText = reason.trim();
    if (!trade || !effectiveMilestone || reasonText.length < 12) {
      toast.error("Choose a milestone and provide at least 12 characters.");
      return;
    }

    try {
      await handleRaiseDispute(trade, effectiveMilestone - 1, reasonText);
      await openDispute(trade.id, effectiveMilestone, reasonText);
      toast.success("Dispute opened successfully.");
      router.push(`/trades/${trade.id}`);
    } catch {
      // handled by hook toasts
    }
  }

  if (loading || !trade) {
    return (
      <div className="max-w-xl space-y-5 animate-fade-in">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-44 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6 animate-fade-in">
      <Link
        href={`/trades/${trade.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to trade
      </Link>

      <div className="trade-card space-y-4 border-red-400/30">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <h1 className="text-base font-semibold">Open Dispute</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Opening a dispute freezes escrow progression for this trade milestone
          until arbitration review is completed.
        </p>

        <div className="space-y-2">
          <Label>Milestone</Label>
          <Select
            value={effectiveMilestone ? String(effectiveMilestone) : undefined}
            onValueChange={(value) => setMilestoneNumber(Number(value))}
          >
            <SelectTrigger className="bg-input border-border">
              <SelectValue placeholder="Select milestone" />
            </SelectTrigger>
            <SelectContent>
              {milestones.map((num) => (
                <SelectItem key={num} value={String(num)}>
                  Milestone {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Quick reason</Label>
          <div className="flex flex-wrap gap-2">
            {DISPUTE_REASON_PRESETS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={preset === option ? "default" : "outline"}
                onClick={() => {
                  setPreset(option);
                  if (!reason.trim()) {
                    setReason(option);
                  }
                }}
                className={preset === option ? "gradient-gold text-black" : ""}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reason for dispute</Label>
          <Textarea
            placeholder="Describe the issue in detail so arbitration can review quickly."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-input border-border resize-none h-28"
          />
          <p className="text-[11px] text-muted-foreground">
            Minimum 12 characters ({reason.trim().length}/12)
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={submitDispute}
            disabled={
              actionLoading ||
              !effectiveMilestone ||
              reason.trim().length < 12 ||
              milestones.length === 0
            }
            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {actionLoading ? "Submitting..." : "Confirm and Open Dispute"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/trades/${trade.id}`}>Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
