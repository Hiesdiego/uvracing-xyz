import * as React from "react";

import { cn } from "@/lib/utils";

function Sheet({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SheetTrigger(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

function SheetClose(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-black/20", className)}
      {...props}
    />
  );
}

function SheetContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-content"
      className={cn("fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background p-6 shadow-lg", className)}
      {...props}
    />
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-2", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-auto flex flex-col gap-2 sm:flex-row", className)} {...props} />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
