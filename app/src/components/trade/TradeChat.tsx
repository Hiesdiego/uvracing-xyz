"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Send, Lock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, shortAddress } from "@/lib/utils";

type MessageSender = {
  id: string;
  display_name: string | null;
  wallet_address: string;
  business_name: string | null;
};

type Message = {
  id: string;
  trade_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender: MessageSender;
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatDate(dateStr);
}

export function TradeChat({
  tradeId,
  isClosed,
}: {
  tradeId: string;
  isClosed: boolean;
}) {
  const { getAccessToken, user } = usePrivy();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousMessageCountRef = useRef(0);

  /**
   * FIX: Store getAccessToken in a ref so it's always current without
   * being a useCallback dependency. This breaks the feedback loop:
   *
   *   OLD (broken):
   *   getAccessToken changes → fetchMessages new ref → useEffect fires
   *   → API call → response → re-render → getAccessToken changes → repeat
   *
   *   NEW (fixed):
   *   getAccessTokenRef always points to latest fn, fetchMessages ref is
   *   stable, neither useEffect ever fires due to auth state changes.
   */
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  const walletAddress =
    user?.wallet?.address ??
    user?.linkedAccounts?.find((a) => a.type === "wallet")?.address;

  /**
   * fetchMessages — stable reference, only changes if tradeId changes.
   * Does NOT include getAccessToken in deps (uses ref instead).
   */
  const fetchMessages = useCallback(async () => {
    try {
      const token = await getAccessTokenRef.current();
      if (!token) return;
      const res = await fetch(`/api/trades/${tradeId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Message[];
      setMessages((prev) => {
        // Only update state if something actually changed —
        // avoids re-renders when polling returns identical data
        const prevLast = prev[prev.length - 1]?.id;
        const nextLast = data[data.length - 1]?.id;
        if (prev.length === data.length && prevLast === nextLast) return prev;
        return data;
      });
    } catch {
      // no-op: chat polling should never break the page
    }
  }, [tradeId]); // tradeId is the only real dependency

  // Initial fetch — runs once on mount and when tradeId changes
  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  // Background polling — stable interval, never restarts due to auth changes
  useEffect(() => {
    const interval = setInterval(fetchMessages, 20_000);
    return () => clearInterval(interval);
  }, [fetchMessages]); // fetchMessages only changes when tradeId changes

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  async function sendMessage() {
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      const token = await getAccessTokenRef.current();
      if (!token) return;
      const res = await fetch(`/api/trades/${tradeId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (res.ok) {
        const newMsg = (await res.json()) as Message;
        setMessages((prev) => [...prev, newMsg]);
        setContent("");
        textareaRef.current?.focus();
      }
    } catch {
      // no-op
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const groupedMessages = messages.reduce<
    { day: string; messages: Message[] }[]
  >((groups, msg) => {
    const day = formatDay(msg.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(msg);
    } else {
      groups.push({ day, messages: [msg] });
    }
    return groups;
  }, []);

  return (
    <div className="trade-card flex flex-col" style={{ minHeight: "420px" }}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trade Chat</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Lock className="w-2.5 h-2.5" />
          Private - buyer, supplier &amp; TradeOS only
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1"
        style={{ maxHeight: "320px" }}
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  i % 2 === 0 ? "justify-start" : "justify-end"
                )}
              >
                <Skeleton className="h-12 w-48 rounded-xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start the conversation with your trade partner.
            </p>
          </div>
        ) : (
          groupedMessages.map(({ day, messages: dayMsgs }) => (
            <div key={day}>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {day}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {dayMsgs.map((msg) => {
                const isOwn = msg.sender.wallet_address === walletAddress;
                const senderLabel =
                  msg.sender.display_name ??
                  msg.sender.business_name ??
                  shortAddress(msg.sender.wallet_address);

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex mb-2",
                      isOwn ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-xs rounded-xl px-3 py-2 text-sm",
                        isOwn
                          ? "bg-[hsl(var(--gold)/0.15)] border border-[hsl(var(--gold)/0.3)] rounded-br-sm"
                          : "bg-secondary border border-border rounded-bl-sm"
                      )}
                    >
                      {!isOwn && (
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                          {senderLabel}
                        </p>
                      )}
                      <p className="leading-relaxed break-words">
                        {msg.content}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] mt-1",
                          isOwn
                            ? "text-[hsl(var(--gold)/0.6)] text-right"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {isClosed ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
          <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Chat is closed. Messages are deleted 7 days after trade completion.
          </p>
        </div>
      ) : (
        <div className="flex items-end gap-2 pt-3 border-t border-border">
          <Textarea
            ref={textareaRef}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-input border-border resize-none text-sm flex-1 min-h-[40px] max-h-[120px]"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !content.trim()}
            size="sm"
            className="h-10 w-10 p-0 gradient-gold text-black hover:opacity-90 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}