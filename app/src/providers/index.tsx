"use client";

import { useEffect } from "react";
import { PrivyProvider } from "./PrivyProvider";
import { Toaster } from "react-hot-toast";
import { EnsureEmbeddedSolanaWallet } from "@/components/auth/EnsureEmbeddedSolanaWallet";
import { cleanupConnection } from "@/lib/solana/program";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onBeforeUnload = () => cleanupConnection();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      cleanupConnection();
    };
  }, []);

  return (
    <PrivyProvider>
      <EnsureEmbeddedSolanaWallet />
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(222 47% 8%)",
            color: "hsl(210 40% 96%)",
            border: "1px solid hsl(222 30% 14%)",
            fontFamily: "Sora, sans-serif",
            fontSize: "14px",
          },
          success: {
            iconTheme: { primary: "#F5A623", secondary: "hsl(222 47% 8%)" },
          },
        }}
      />
    </PrivyProvider>
  );
}
