"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Wallet,
  Copy,
  Check,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  cn,
  formatUsdc,
  shortAddress,
  formatDate,
  solscanAccountUrl,
  solscanTxUrl,
} from "@/lib/utils";
import { USDC_MINT } from "@/lib/constants";

type MilestoneEvent = {
  trade_number: string;
  trade_id: string;
  milestone_number: number;
  direction: "in" | "out";
  amount_usdc: number;
  tx_signature: string | null;
  released_at: string;
  description: string;
};

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
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function BalanceCard({
  balance,
  walletAddress,
  loading,
  onRefresh,
  refreshing,
}: {
  balance: number | null;
  walletAddress: string | null;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="trade-card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md gradient-gold flex items-center justify-center">
            <Wallet className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-semibold">USDC Wallet</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-gold transition-colors"
          title="Refresh balance"
        >
          <RefreshCw
            className={cn("w-4 h-4", refreshing && "animate-spin")}
          />
        </button>
      </div>

      {/* Balance */}
      <div>
        {loading ? (
          <Skeleton className="h-12 w-48" />
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold font-mono text-gold">
              {balance !== null ? formatUsdc(balance) : "-"}
            </span>
            <span className="text-muted-foreground text-sm mb-1">USDC</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Available balance on Solana devnet
        </p>
      </div>

      {/* Wallet address */}
      {walletAddress && (
        <div className="pt-4 border-t border-border space-y-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
              Wallet Address
            </p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm">{shortAddress(walletAddress, 8)}</p>
              <CopyButton text={walletAddress} />
              <a
                href={solscanAccountUrl(walletAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-gold transition-colors"
                title="View on Solscan"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
              USDC Mint (Devnet)
            </p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                {shortAddress(USDC_MINT, 8)}
              </p>
              <CopyButton text={USDC_MINT} />
            </div>
          </div>
        </div>
      )}

      {/* Faucet link */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-[hsl(var(--gold)/0.05)] border border-[hsl(var(--gold)/0.2)]">
        <Droplets className="w-3.5 h-3.5 text-gold flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Need devnet USDC?{" "}
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:underline"
          >
            Get test USDC from Circle faucet -&gt;
          </a>
        </p>
      </div>
    </div>
  );
}

function TxRow({ event }: { event: MilestoneEvent }) {
  const isIn = event.direction === "in";

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-card hover:border-[hsl(var(--gold)/0.2)] transition-all">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            isIn
              ? "bg-green-500/10 text-green-400"
              : "bg-red-400/10 text-red-400"
          )}
        >
          {isIn ? (
            <ArrowDownLeft className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpRight className="w-3.5 h-3.5" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">
            {isIn ? "Received" : "Escrowed"} - {event.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono text-muted-foreground">
              {event.trade_number}
            </span>
            {event.tx_signature && (
              <a
                href={solscanTxUrl(event.tx_signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground hover:text-gold flex items-center gap-0.5 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Solscan
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="text-right">
        <p
          className={cn(
            "text-sm font-mono font-bold",
            isIn ? "text-green-400" : "text-muted-foreground"
          )}
        >
          {isIn ? "+" : "-"}${formatUsdc(event.amount_usdc)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatDate(event.released_at)}
        </p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const walletAddress = wallets[0]?.address ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<MilestoneEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const fetchBalance = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/wallet/balance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance);
        }
      } catch {} finally {
        setBalanceLoading(false);
        setRefreshing(false);
      }
    },
    [getAccessToken]
  );

  const fetchEvents = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/wallet/transactions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setEvents(await res.json());
      }
    } catch {} finally {
      setEventsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchBalance();
    fetchEvents();
  }, [fetchBalance, fetchEvents]);

  return (
    <div className="max-w-2xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your USDC balance and escrow transaction history
        </p>
      </div>

      <BalanceCard
        balance={balance}
        walletAddress={walletAddress}
        loading={balanceLoading}
        onRefresh={() => fetchBalance(true)}
        refreshing={refreshing}
      />

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Transaction History
        </h2>

        {eventsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="trade-card text-center py-10">
            <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No transactions yet - escrow events will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event, i) => (
              <TxRow key={`${event.trade_id}-${event.milestone_number}-${i}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

