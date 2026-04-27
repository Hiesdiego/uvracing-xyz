//tradeos/app/src/hooks/useTrade.ts

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import type { Trade } from "@/types";

async function apiFetch(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "API error");
  return data;
}

/**
 * useStableAccessToken
 *
 * THE FIX for the auto-refresh / infinite polling loop.
 *
 * Problem: Privy's `getAccessToken` changes reference whenever Privy
 * updates its internal auth state (token refresh, re-render after a
 * successful fetch, etc.). Placing it in useCallback deps causes:
 *   getAccessToken changes → fetchTrade new ref → useEffect fires
 *   → setLoading(true) → skeleton flash → fetch → setTrade → re-render
 *   → getAccessToken changes again → loop.
 *
 * Solution: store getAccessToken in a ref that updates every render.
 * Expose a stable wrapper that never changes reference, so it's safe
 * to use in useCallback without including it in deps.
 */
function useStableAccessToken() {
  const { getAccessToken } = usePrivy();
  const ref = useRef(getAccessToken);
  ref.current = getAccessToken; // always current, no dep array needed
  return useCallback(() => ref.current(), []);
}

/** Fetches all trades for the current user */
export function useTrades() {
  const getToken = useStableAccessToken();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const data = await apiFetch("/api/trades", token);
      setTrades(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load trades";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [getToken]); // getToken is stable — this callback never needlessly recreates

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return { trades, loading, error, refetch: fetchTrades };
}

/** Fetches a single trade by ID, with silent background-refetch support */
export function useTradeDetail(tradeId: string, inviteToken?: string | null) {
  const getToken = useStableAccessToken();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true); // true only for first load
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  /**
   * fetchTrade(silent?)
   * silent=true  → data updates in background, no skeleton shown (used by polling)
   * silent=false → shows loading skeleton (only on initial mount / trade change)
   */
  const fetchTrade = useCallback(
    async (silent = false) => {
      if (!tradeId) return;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const inviteQuery = inviteToken
          ? `?invite_token=${encodeURIComponent(inviteToken)}`
          : "";
        const data = await apiFetch(
          `/api/trades/${tradeId}${inviteQuery}`,
          token
        );
        setTrade(data);
        hasLoadedRef.current = true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load trade";
        if (!hasLoadedRef.current) setError(msg); // only show error on first load
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tradeId, inviteToken, getToken]
  );

  // Initial fetch — reset hasLoadedRef so skeleton shows if tradeId changes
  useEffect(() => {
    hasLoadedRef.current = false;
    fetchTrade(false);
  }, [fetchTrade]);

  // Public refetch: always silent so background polls don't flash the skeleton
  const refetch = useCallback(() => fetchTrade(true), [fetchTrade]);

  return { trade, loading, error, refetch };
}

/** Mutations — create, accept, fund, proof, release, dispute */
export function useTradeActions() {
  const getToken = useStableAccessToken();
  const [loading, setLoading] = useState(false);

  async function getTokenOrThrow() {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }

  async function createTrade(payload: {
    goods_description: string;
    goods_category?: string;
    quantity?: string;
    total_amount_usdc: number;
    corridor?: string;
    pickup_location?: string;
    dropoff_location?: string;
    buyer_contact_name?: string;
    buyer_contact_phone?: string;
    supplier_contact_name?: string;
    supplier_contact_phone?: string;
    expected_ship_date?: string;
    expected_delivery_date?: string;
    shipping_reference?: string;
    incoterm?: string;
    notes?: string;
    milestones?: { description: string; release_percentage: number }[];
  }): Promise<Trade> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      const trade = await apiFetch("/api/trades", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(`Trade ${trade.trade_number} created`);
      return trade;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create trade";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function acceptTrade(tradeId: string, invite_token: string): Promise<Trade> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      const trade = await apiFetch(`/api/trades/${tradeId}/accept`, token, {
        method: "POST",
        body: JSON.stringify({ invite_token }),
      });
      toast.success("Trade accepted. Buyer can now fund escrow.");
      return trade;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept trade";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function declineTrade(tradeId: string, invite_token: string): Promise<Trade> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      const trade = await apiFetch(`/api/trades/${tradeId}/decline`, token, {
        method: "POST",
        body: JSON.stringify({ invite_token }),
      });
      toast.success("Trade declined");
      return trade;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to decline trade";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function recordFunding(
    tradeId: string,
    escrow_pubkey: string,
    tx_signature: string
  ): Promise<Trade> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      return await apiFetch(`/api/trades/${tradeId}/fund`, token, {
        method: "POST",
        body: JSON.stringify({ escrow_pubkey, tx_signature }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record funding";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function uploadProof(
    tradeId: string,
    milestone_number: number,
    proof_url: string
  ): Promise<void> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      await apiFetch(`/api/trades/${tradeId}/proof`, token, {
        method: "POST",
        body: JSON.stringify({ milestone_number, proof_url }),
      });
      toast.success("Proof uploaded successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload proof";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function recordRelease(
    tradeId: string,
    milestone_number: number,
    tx_signature: string
  ): Promise<Trade> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      return await apiFetch(`/api/trades/${tradeId}/release`, token, {
        method: "POST",
        body: JSON.stringify({ milestone_number, tx_signature }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record release";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function openDispute(
    tradeId: string,
    milestone_number: number,
    reason: string
  ): Promise<void> {
    setLoading(true);
    try {
      const token = await getTokenOrThrow();
      await apiFetch(`/api/trades/${tradeId}/dispute`, token, {
        method: "POST",
        body: JSON.stringify({ milestone_number, reason }),
      });
      toast.success("Dispute opened. Escrow frozen.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open dispute";
      toast.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    createTrade,
    acceptTrade,
    declineTrade,
    recordFunding,
    uploadProof,
    recordRelease,
    openDispute,
  };
}