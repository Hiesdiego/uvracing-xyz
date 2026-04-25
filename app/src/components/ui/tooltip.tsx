import * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TooltipTrigger({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return <button className={cn(className)} type="button" {...props} />;
}

function TooltipContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tooltip-content"
      className={cn(
        "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background",
        className
      )}
      {...props}
    />
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
