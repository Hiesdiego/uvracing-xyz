"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Scale,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDate, formatUsdc, shortAddress, solscanAccountUrl } from "@/lib/utils";
import { ARBITER_WALLET } from "@/lib/constants";
import { useWallets } from "@privy-io/react-auth";
import { useEscrow } from "@/hooks/useEscrow";
import { PublicKey } from "@solana/web3.js";

type DisputeUser = {
  id: string;
  wallet_address: string;
  display_name: string | null;
  business_name: string | null;
  reputation_score: number;
};

type DisputeTrade = {
  id: string;
  trade_number: string;
  goods_description: string;
  total_amount_usdc: number;
  escrow_pubkey: string | null;
  corridor: string;
  buyer: DisputeUser;
  supplier: DisputeUser | null;
  milestones: { milestone_number: number; proof_url: string | null; status: string }[];
};

type Dispute = {
  id: string;
  trade_id: string;
  raised_by: string;
  reason: string;
  status: string;
  arbiter_notes: string | null;
  created_at: string;
  trade: DisputeTrade;
  raiser: DisputeUser;
};

function DisputeCard({
  dispute,
  onResolve,
  resolving,
}: {
  dispute: Dispute;
  onResolve: (
    disputeId: string,
    resolution: string,
    notes: string,
    supplierBps: number
  ) => void;
  resolving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolution, setResolution] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [supplierBps, setSupplierBps] = useState(50);

  const trade = dispute.trade;
  const raisedByBuyer = dispute.raised_by === trade.buyer.id;
  const raisedByLabel = raisedByBuyer ? "Buyer" : "Supplier";
  const proofUploaded = trade.milestones.some((m) => m.proof_url);

  const statusColors: Record<string, string> = {
    open: "text-red-400 border-red-400/30",
    under_review: "text-yellow-400 border-yellow-400/30",
    resolved_buyer: "text-green-400 border-green-400/30",
    resolved_supplier: "text-green-400 border-green-400/30",
    resolved_split: "text-blue-400 border-blue-400/30",
  };

  const isResolved = dispute.status.startsWith("resolved");

  return (
    <div
      className={cn(
        "trade-card space-y-4",
        !isResolved && "border-red-400/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold">
              {trade.trade_number}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] py-0",
                statusColors[dispute.status] ?? "text-muted-foreground"
              )}
            >
              {dispute.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {trade.goods_description}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-mono font-bold text-gold">
            ${formatUsdc(Number(trade.total_amount_usdc))}
          </p>
          <p className="text-[10px] text-muted-foreground">USDC at stake</p>
        </div>
      </div>

      {/* Dispute reason */}
      <div className="px-3 py-2.5 rounded-md bg-red-400/5 border border-red-400/20">
        <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1 font-semibold">
          Dispute Reason — raised by {raisedByLabel}
        </p>
        <p className="text-sm">{dispute.reason}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDate(dispute.created_at)}
        </p>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 py-2.5 rounded-md bg-secondary/50 border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Buyer
          </p>
          <p className="text-sm font-medium">
            {trade.buyer.display_name ?? trade.buyer.business_name ?? "—"}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground">
            {shortAddress(trade.buyer.wallet_address)}
          </p>
          <p className="text-[10px] text-gold mt-0.5">
            ⭐ {Number(trade.buyer.reputation_score).toFixed(1)}
          </p>
        </div>
        <div className="px-3 py-2.5 rounded-md bg-secondary/50 border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Supplier
          </p>
          <p className="text-sm font-medium">
            {trade.supplier?.display_name ??
              trade.supplier?.business_name ??
              "—"}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground">
            {trade.supplier
              ? shortAddress(trade.supplier.wallet_address)
              : "—"}
          </p>
          <p className="text-[10px] text-gold mt-0.5">
            ⭐{" "}
            {trade.supplier
              ? Number(trade.supplier.reputation_score).toFixed(1)
              : "—"}
          </p>
        </div>
      </div>

      {/* Proof documents */}
      {proofUploaded && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Shipping Proof
          </p>
          <div className="space-y-1">
            {trade.milestones
              .filter((m) => m.proof_url)
              .map((m) => (
                <a
                  key={m.milestone_number}
                  href={m.proof_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-gold hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Milestone {m.milestone_number} proof
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Escrow link */}
      {trade.escrow_pubkey && (
        <a
          href={solscanAccountUrl(trade.escrow_pubkey)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          View escrow on Solscan
        </a>
      )}

      {/* Resolve panel */}
      {!isResolved && (
        <div className="border-t border-border pt-4">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold/80 transition-colors"
          >
            <Scale className="w-4 h-4" />
            Resolve Dispute
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {expanded && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Ruling</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">
                      Rule for Buyer — refund remaining to buyer
                    </SelectItem>
                    <SelectItem value="supplier">
                      Rule for Supplier — release remaining to supplier
                    </SelectItem>
                    <SelectItem value="split">
                      Split — divide remaining between both
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {resolution === "split" && (
                <div className="space-y-2">
                  <Label>
                    Supplier receives:{" "}
                    <span className="text-gold font-mono">{supplierBps}%</span>
                    {" "}— Buyer receives:{" "}
                    <span className="text-gold font-mono">
                      {100 - supplierBps}%
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={supplierBps}
                    onChange={(e) => setSupplierBps(Number(e.target.value))}
                    className="w-full accent-[hsl(var(--gold))]"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Arbiter notes (optional)</Label>
                <Textarea
                  placeholder="Explain your ruling — both parties will see this..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-input border-border resize-none h-20"
                />
              </div>

              <Button
                onClick={() => {
                  const bps =
                    resolution === "buyer"
                      ? 0
                      : resolution === "supplier"
                      ? 10000
                      : supplierBps * 100;
                  onResolve(dispute.id, resolution, notes, bps);
                }}
                disabled={resolving || !resolution}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                {resolving ? "Resolving..." : "Submit Ruling"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Already resolved */}
      {isResolved && dispute.arbiter_notes && (
        <div className="px-3 py-2.5 rounded-md bg-secondary/30 border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Arbiter Notes
          </p>
          <p className="text-sm">{dispute.arbiter_notes}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved">("open");

  const walletAddress =
    wallets[0]?.address ??
    user?.wallet?.address ??
    user?.linkedAccounts?.find((a) => a.type === "wallet")?.address;

  const isArbiter = walletAddress === ARBITER_WALLET;

  const fetchDisputes = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/admin/disputes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDisputes(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  async function handleResolve(
    disputeId: string,
    resolution: string,
    notes: string,
    supplierBps: number
  ) {
    setResolving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resolution,
          arbiter_notes: notes,
          release_to_supplier_bps: supplierBps,
        }),
      });
      if (res.ok) {
        await fetchDisputes();
      }
    } catch {} finally {
      setResolving(false);
    }
  }

  const filtered = disputes.filter((d) =>
    filter === "open"
      ? !d.status.startsWith("resolved")
      : d.status.startsWith("resolved")
  );

  if (!isArbiter) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="text-lg font-bold mb-2">Restricted Access</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          This area is only accessible to the TradeOS arbiter wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-5 h-5 text-gold" />
          <h1 className="text-2xl font-bold">Arbiter Dashboard</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Review and resolve trade disputes
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
        {(["open", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              filter === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "open" ? "Open" : "Resolved"}
            {f === "open" && disputes.filter((d) => !d.status.startsWith("resolved")).length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-400/20 text-red-400 text-[10px] font-mono">
                {disputes.filter((d) => !d.status.startsWith("resolved")).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="trade-card text-center py-12">
          <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "open"
              ? "No open disputes — all clear."
              : "No resolved disputes yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((dispute) => (
            <DisputeCard
              key={dispute.id}
              dispute={dispute}
              onResolve={handleResolve}
              resolving={resolving}
            />
          ))}
        </div>
      )}
    </div>
  );
}
