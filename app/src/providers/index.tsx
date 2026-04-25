"use client";

import { PrivyProvider } from "./PrivyProvider";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider>
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