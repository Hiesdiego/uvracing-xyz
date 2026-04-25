"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, Shield, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Shield,
    title: "Milestone Escrow",
    body: "USDC locks on-chain and releases only when each shipment milestone is confirmed. Zero trust required.",
  },
  {
    icon: Zap,
    title: "Instant Settlement",
    body: "Solana settles in under a second. No SWIFT delays. No correspondent bank fees.",
  },
  {
    icon: Globe,
    title: "Built for the Corridor",
    body: "Designed for Lagos and Accra merchants sourcing from Dubai - the flows, the currencies, the disputes.",
  },
];

export default function LandingPage() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push("/dashboard");
    }
  }, [ready, authenticated, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md gradient-gold flex items-center justify-center">
            <span className="text-xs font-bold text-black">T</span>
          </div>
          <span className="font-semibold text-sm">TradeOS</span>
        </div>
        <Button
          onClick={login}
          size="sm"
          className="gradient-gold text-black font-semibold text-xs hover:opacity-90"
        >
          Get Started <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold)/0.05)] text-gold text-xs font-mono mb-6">
          <span className="status-dot bg-gold animate-pulse-gold" />
          Live on Solana Devnet
        </div>

        <h1 className="text-5xl font-bold leading-tight max-w-2xl mb-6">
          Programmable trust for{" "}
          <span className="text-gold">corridor merchants</span>
        </h1>

        <p className="text-muted-foreground text-lg max-w-xl mb-10 leading-relaxed">
          Replace WhatsApp wire transfers with milestone-based USDC escrow on
          Solana. West Africa &lt;-&gt; UAE trade, finally with recourse.
        </p>

        <div className="flex items-center gap-3">
          <Button
            onClick={login}
            size="lg"
            className="gradient-gold text-black font-semibold hover:opacity-90 glow-gold"
          >
            Start a Trade <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a
              href={`https://solscan.io/account/${process.env.NEXT_PUBLIC_PROGRAM_ID}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Contract
            </a>
          </Button>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="trade-card">
              <div className="w-9 h-9 rounded-md bg-[hsl(var(--gold)/0.1)] border border-[hsl(var(--gold)/0.2)] flex items-center justify-center mb-4">
                <Icon className="w-4.5 h-4.5 text-gold" />
              </div>
              <h3 className="font-semibold text-sm mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-8 py-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-mono">
          TradeOS - Devnet
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          {process.env.NEXT_PUBLIC_PROGRAM_ID?.slice(0, 8)}...
        </p>
      </footer>
    </div>
  );
}
