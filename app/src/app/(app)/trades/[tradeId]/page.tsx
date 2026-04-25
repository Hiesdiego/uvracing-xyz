"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  Unlock,
  Copy,
  Check,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import { useTradeDetail, useTradeActions } from "@/hooks/useTrade";
import { useEscrow } from "@/hooks/useEscrow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { TradeChat } from "@/components/trade/TradeChat";
import {
  formatUsdc,
  shortAddress,
  formatDate,
  solscanTxUrl,
  solscanAccountUrl,
  cn,
} from "@/lib/utils";
import { TRADE_STATUS_COLORS, TRADE_STATUS_LABELS } from "@/lib/constants";
import type { Milestone, Trade } from "@/types";

function MilestoneStep({
  milestone,
  trade,
  isBuyer,
  isSupplier,
  onProofUpload,
  onRelease,
  onDispute,
  actionLoading,
}: {
  milestone: Milestone;
  trade: Trade;
  isBuyer: boolean;
  isSupplier: boolean;
  onProofUpload: (milestoneNumber: number, url: string) => void;
  onRelease: (milestoneNumber: number) => void;
  onDispute: (milestoneNumber: number) => void;
  actionLoading: boolean;
}) {
  const [proofUrl, setProofUrl] = useState("");
  const [showProofInput, setShowProofInput] = useState(false);

  const releaseAmount = trade.total_amount_usdc
    ? (Number(trade.total_amount_usdc) * milestone.release_percentage) / 100
    : 0;

  const statusConfig = {
    pending: {
      icon: Clock,
      color: "text-muted-foreground",
      label: "Pending",
    },
    proof_uploaded: {
      icon: Upload,
      color: "text-gold",
      label: "Proof Uploaded",
    },
    released: {
      icon: CheckCircle2,
      color: "text-green-400",
      label: "Released",
    },
    disputed: {
      icon: AlertTriangle,
      color: "text-red-400",
      label: "Disputed",
    },
  };

  const config = statusConfig[milestone.status];
  const Icon = config.icon;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0",
            milestone.status === "released"
              ? "border-green-400 bg-green-400/10"
              : milestone.status === "proof_uploaded"
                ? "border-gold bg-[hsl(var(--gold)/0.1)]"
                : milestone.status === "disputed"
                  ? "border-red-400 bg-red-400/10"
                  : "border-border bg-muted/30"
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", config.color)} />
        </div>
        <div className="w-px flex-1 bg-border mt-2 mb-2" />
      </div>

      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between mb-1">
          <div>
            <span className="text-xs text-muted-foreground font-mono">
              Milestone {milestone.milestone_number}
            </span>
            <h3 className="text-sm font-semibold">{milestone.description}</h3>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-bold text-gold">
              ${formatUsdc(releaseAmount)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {milestone.release_percentage}% of total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={cn("text-xs", config.color)}>{config.label}</span>
          {milestone.released_at && (
            <span className="text-[10px] text-muted-foreground">
              Released {formatDate(milestone.released_at)}
            </span>
          )}
          {milestone.tx_signature && (
            <a
              href={solscanTxUrl(milestone.tx_signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-gold flex items-center gap-0.5 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Solscan
            </a>
          )}
        </div>

        {milestone.proof_url && (
          <a
            href={milestone.proof_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gold hover:underline mb-3"
          >
            <ExternalLink className="w-3 h-3" />
            View shipping proof
          </a>
        )}

        <div className="flex flex-wrap gap-2">
          {isSupplier &&
            milestone.status === "pending" &&
            ["funded", "in_progress", "milestone_1_released", "milestone_2_released"].includes(
              trade.status
            ) && (
              <>
                {showProofInput ? (
                  <div className="flex items-center gap-2 w-full">
                    <Input
                      placeholder="https://cloudinary.com/your-document-url"
                      value={proofUrl}
                      onChange={(e) => setProofUrl(e.target.value)}
                      className="bg-input border-border text-xs h-8 flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (proofUrl.trim()) {
                          onProofUpload(milestone.milestone_number, proofUrl);
                          setShowProofInput(false);
                          setProofUrl("");
                        }
                      }}
                      disabled={actionLoading || !proofUrl.trim()}
                      className="h-8 text-xs gradient-gold text-black font-semibold hover:opacity-90"
                    >
                      Submit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowProofInput(false)}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setShowProofInput(true)}
                    className="h-7 text-xs gradient-gold text-black font-semibold hover:opacity-90"
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload Proof
                  </Button>
                )}
              </>
            )}

          {isBuyer && milestone.status === "proof_uploaded" && (
            <>
              <Button
                size="sm"
                onClick={() => onRelease(milestone.milestone_number)}
                disabled={actionLoading}
                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                <Unlock className="w-3 h-3 mr-1" />
                Approve and Release
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDispute(milestone.milestone_number)}
                disabled={actionLoading}
                className="h-7 text-xs border-red-400/40 text-red-400 hover:bg-red-400/10"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Dispute
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-gold transition-colors"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

export default function TradeDetailPage({
  params,
}: {
  params: Promise<{ tradeId: string }>;
}) {
  const { tradeId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteToken = searchParams.get("invite_token");
  const createdFromIntent = searchParams.get("created") === "1";

  const { user } = usePrivy();
  const { trade, loading, error, refetch } = useTradeDetail(tradeId, inviteToken);
  const {
    recordFunding,
    uploadProof,
    recordRelease,
    acceptTrade,
    declineTrade,
    loading: apiLoading,
  } = useTradeActions();
  const {
    handleFundEscrow,
    handleReleaseMilestone,
    loading: chainLoading,
  } = useEscrow();

  const walletAddress =
    user?.wallet?.address ??
    user?.linkedAccounts?.find((a) => a.type === "wallet")?.address;

  const isBuyer = trade?.buyer?.wallet_address === walletAddress;
  const isSupplier = trade?.supplier?.wallet_address === walletAddress;
  const isInviteViewer = !!inviteToken && !isBuyer && !isSupplier;
  const actionLoading = apiLoading || chainLoading;

  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!trade) return;
    const previousStatus = previousStatusRef.current;
    if (
      isBuyer &&
      previousStatus === "pending_supplier" &&
      trade.status === "pending_funding"
    ) {
      toast.success("Supplier joined. You can fund escrow now.");
    }
    previousStatusRef.current = trade.status;
  }, [trade, isBuyer]);

  const tradeStatus = trade?.status ?? null;
  const shouldPollBuyerStages =
    Boolean(isBuyer) &&
    (tradeStatus === "pending_supplier" || tradeStatus === "pending_funding");

  useEffect(() => {
    if (!shouldPollBuyerStages) {
      return;
    }
    const timer = setInterval(() => {
      refetch();
    }, 20000);
    return () => clearInterval(timer);
  }, [shouldPollBuyerStages, refetch]);

  const statusLabel = trade
    ? TRADE_STATUS_LABELS[trade.status] ?? trade.status
    : "";
  const statusColor = trade
    ? TRADE_STATUS_COLORS[trade.status] ?? "text-muted-foreground"
    : "";

  const inviteLink = useMemo(
    () => trade?.supplier_invite_link ?? null,
    [trade]
  );

  const nextActor = useMemo(() => {
    if (!trade) return "-";
    if (trade.status === "pending_supplier") return "Supplier";
    if (trade.status === "pending_funding") return "Buyer";
    if (["funded", "in_progress", "milestone_1_released", "milestone_2_released"].includes(trade.status)) return "Supplier / Buyer";
    if (trade.status === "disputed") return "Arbiter";
    return "None";
  }, [trade]);

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast.success("Supplier invite link copied");
  }

  async function onAcceptTrade() {
    if (!trade || !inviteToken) return;
    try {
      await acceptTrade(trade.id, inviteToken);
      router.replace(`/trades/${trade.id}`);
      await refetch();
    } catch {
      // handled by hook toast
    }
  }

  async function onDeclineTrade() {
    if (!trade || !inviteToken) return;
    try {
      await declineTrade(trade.id, inviteToken);
      router.replace("/trades");
    } catch {
      // handled by hook toast
    }
  }

  async function onFundEscrow() {
    if (!trade) return;
    try {
      const { fundTx, escrowPubkey } = await handleFundEscrow(trade);
      await recordFunding(trade.id, escrowPubkey, fundTx);
      refetch();
    } catch {
      // handled by hook toast
    }
  }

  async function onRelease(milestoneNumber: number) {
    if (!trade) return;
    try {
      const tx = await handleReleaseMilestone(trade, milestoneNumber - 1);
      await recordRelease(trade.id, milestoneNumber, tx);
      refetch();
    } catch {
      // handled by hook toast
    }
  }

  function onDispute(milestoneNumber: number) {
    if (!trade) return;
    router.push(`/trades/${trade.id}/dispute?milestone=${milestoneNumber}`);
  }

  async function onProofUpload(milestoneNumber: number, url: string) {
    if (!trade) return;
    await uploadProof(trade.id, milestoneNumber, url);
    refetch();
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground text-sm">{error ?? "Trade not found"}</p>
        <Link href="/trades" className="text-gold text-sm hover:underline mt-2 inline-block">
          Back to trades
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl animate-fade-in space-y-6">
      <Link
        href="/trades"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All trades
      </Link>

      {createdFromIntent && isBuyer && (
        <div className="trade-card border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.03)] space-y-2">
          <p className="text-sm font-semibold text-gold">Trade intent created</p>
          <p className="text-xs text-muted-foreground">
            Next steps: 1) send supplier invite link, 2) wait for supplier to join,
            3) fund escrow once status changes to Awaiting Funding.
          </p>
        </div>
      )}

      <div className="trade-card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg font-bold font-mono">{trade.trade_number}</h1>
              <span className="text-xs text-muted-foreground font-mono">{trade.corridor}</span>
            </div>
            <p className="text-sm text-muted-foreground">{trade.goods_description}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-mono font-bold text-gold">
              ${formatUsdc(Number(trade.total_amount_usdc))}
            </p>
            <p className="text-xs text-muted-foreground">USDC</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Status
            </p>
            <p className={cn("text-sm font-medium", statusColor)}>{statusLabel}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Next Actor
            </p>
            <p className="text-sm">{nextActor}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Buyer
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-mono">
                {shortAddress(trade.buyer?.wallet_address ?? "")}
              </p>
              {trade.buyer?.wallet_address && (
                <CopyButton text={trade.buyer.wallet_address} />
              )}
              {isBuyer && (
                <Badge variant="outline" className="text-[9px] text-gold border-gold/30 py-0 h-4">
                  You
                </Badge>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Supplier
            </p>
            {trade.supplier ? (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-mono">{shortAddress(trade.supplier.wallet_address)}</p>
                <CopyButton text={trade.supplier.wallet_address} />
                {isSupplier && (
                  <Badge variant="outline" className="text-[9px] text-gold border-gold/30 py-0 h-4">
                    You
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Awaiting supplier</p>
            )}
          </div>
        </div>

        {trade.escrow_pubkey && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Escrow Account
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-muted-foreground">
                {shortAddress(trade.escrow_pubkey, 8)}
              </p>
              <CopyButton text={trade.escrow_pubkey} />
              <a
                href={solscanAccountUrl(trade.escrow_pubkey)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground hover:text-gold flex items-center gap-0.5 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" /> Solscan
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="trade-card space-y-2">
        <p className="text-sm font-semibold">Trade Timeline</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={cn("rounded-md border px-2 py-1", ["pending_supplier", "pending_funding", "funded", "in_progress", "milestone_1_released", "milestone_2_released", "completed", "disputed"].includes(trade.status) ? "border-gold/40 text-gold" : "border-border text-muted-foreground")}>
            1. Intent Created
          </div>
          <div className={cn("rounded-md border px-2 py-1", ["pending_funding", "funded", "in_progress", "milestone_1_released", "milestone_2_released", "completed", "disputed"].includes(trade.status) ? "border-gold/40 text-gold" : "border-border text-muted-foreground")}>
            2. Supplier Joined
          </div>
          <div className={cn("rounded-md border px-2 py-1", ["pending_funding"].includes(trade.status) ? "border-gold/40 text-gold" : "border-border text-muted-foreground")}>
            3. Awaiting Funding
          </div>
          <div className={cn("rounded-md border px-2 py-1", ["funded", "in_progress", "milestone_1_released", "milestone_2_released", "completed", "disputed"].includes(trade.status) ? "border-gold/40 text-gold" : "border-border text-muted-foreground")}>
            4. Escrow Funded
          </div>
        </div>
      </div>

      {isBuyer && trade.status === "pending_supplier" && (
        <div className="trade-card border-[hsl(var(--gold)/0.35)] bg-[hsl(var(--gold)/0.03)] space-y-3">
          <p className="text-sm font-semibold">Invite Supplier</p>
          <p className="text-xs text-muted-foreground">
            Share this link with your supplier. The page auto-refreshes every 10s and will update when they join.
          </p>
          <div className="rounded-md border border-border bg-input/40 px-3 py-2 text-xs font-mono break-all">
            {inviteLink ?? "Invite link not available"}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={copyInviteLink}
              disabled={!inviteLink}
              className="gradient-gold text-black font-semibold hover:opacity-90"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy Invite Link
            </Button>
            {inviteLink && (
              <Button type="button" size="sm" variant="outline" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(inviteLink)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Send via WhatsApp
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Supplier status: {trade.supplier ? "Joined" : "Not joined yet"}
          </p>
        </div>
      )}

      {isInviteViewer && trade.status === "pending_supplier" && (
        <div className="trade-card border-[hsl(var(--gold)/0.35)] bg-[hsl(var(--gold)/0.03)] space-y-3">
          <p className="text-sm font-semibold">Supplier Invitation</p>
          <p className="text-xs text-muted-foreground">
            If this trade matches your agreement, accept to join as supplier. Buyer will fund escrow after you join.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={onAcceptTrade}
              disabled={actionLoading}
              className="gradient-gold text-black font-semibold hover:opacity-90"
            >
              {actionLoading ? "Processing..." : "Accept Trade"}
            </Button>
            <Button
              variant="outline"
              onClick={onDeclineTrade}
              disabled={actionLoading}
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      {isBuyer && trade.status === "pending_funding" && (
        <div className="trade-card border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.03)] space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold" />
            <p className="text-sm font-semibold">Fund the Escrow</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Connect your buyer wallet with enough devnet USDC, then lock
            ${formatUsdc(Number(trade.total_amount_usdc))} USDC into escrow.
            Funds release by milestones.
          </p>
          <Button
            onClick={onFundEscrow}
            disabled={actionLoading}
            className="gradient-gold text-black font-semibold hover:opacity-90 glow-gold"
          >
            <Lock className="w-4 h-4 mr-2" />
            {actionLoading ? "Processing..." : `Lock $${formatUsdc(Number(trade.total_amount_usdc))} USDC`}
          </Button>
        </div>
      )}

      <div className="trade-card space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Milestones
        </h2>
        {trade.milestones && trade.milestones.length > 0 ? (
          <div>
            {trade.milestones.map((milestone) => (
              <MilestoneStep
                key={milestone.id}
                milestone={milestone}
                trade={trade}
                isBuyer={isBuyer}
                isSupplier={isSupplier}
                onProofUpload={onProofUpload}
                onRelease={onRelease}
                onDispute={onDispute}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No milestones found.</p>
        )}
      </div>

      <TradeChat
        tradeId={trade.id}
        isClosed={["completed", "cancelled", "refunded"].includes(trade.status)}
      />

      {(isBuyer || isSupplier) &&
        !["completed", "cancelled", "refunded", "disputed"].includes(
          trade.status
        ) && (
          <Button
            type="button"
            onClick={() => router.push(`/trades/${trade.id}/dispute`)}
            className="fixed bottom-24 right-6 z-50 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Open Dispute
          </Button>
        )}
    </div>
  );
}
