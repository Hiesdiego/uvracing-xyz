"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Star,
  ShieldAlert,
  LogOut,
  PlusCircle,
} from "lucide-react";
import { cn, shortAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/reputation", label: "Reputation", icon: Star },
  { href: "/admin", label: "Admin", icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, authenticated } = usePrivy();

  const walletAddress =
    user?.wallet?.address ?? user?.linkedAccounts?.find(
      (a) => a.type === "wallet"
    )?.address ?? null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-card border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md gradient-gold flex items-center justify-center">
            <span className="text-xs font-bold text-black">T</span>
          </div>
          <span className="font-semibold text-sm tracking-wide">TradeOS</span>
        </Link>
        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
          West Africa {"<->"} UAE
        </p>
      </div>

      {/* New Trade CTA */}
      <div className="px-3 pt-4">
        <Button
          asChild
          size="sm"
          className="w-full gradient-gold text-black font-semibold text-xs h-8 hover:opacity-90"
        >
          <Link href="/trades/new">
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
            New Trade
          </Link>
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
                active
                  ? "bg-secondary text-gold font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon
                className={cn("w-4 h-4", active && "text-gold")}
                strokeWidth={active ? 2 : 1.5}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {authenticated && (
        <div className="px-3 pb-4 border-t border-border pt-3">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-secondary/30">
            <div className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-black">
                {walletAddress?.slice(0, 2).toUpperCase() ?? "??"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {user?.email?.address ?? "Merchant"}
              </p>
              {walletAddress && (
                <p className="text-[10px] font-mono text-muted-foreground">
                  {shortAddress(walletAddress)}
                </p>
              )}
            </div>
            <button
              onClick={logout}
              className="text-muted-foreground hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
