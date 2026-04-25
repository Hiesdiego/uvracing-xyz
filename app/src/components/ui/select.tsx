import * as React from "react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  value: string;
  setValue: (nextValue: string) => void;
  labels: Map<string, string>;
  registerLabel: (value: string, label: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error(`${component} must be used within Select`);
  }
  return context;
}

type SelectProps = Omit<React.ComponentProps<"div">, "value"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function Select({
  className,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  children,
  ...props
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [labels, setLabels] = React.useState<Map<string, string>>(() => new Map());
  const rootRef = React.useRef<HTMLDivElement>(null);
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : internalValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [isControlled, onValueChange]
  );

  const registerLabel = React.useCallback((nextValue: string, label: string) => {
    setLabels((prev) => {
      if (prev.get(nextValue) === label) return prev;
      const next = new Map(prev);
      next.set(nextValue, label);
      return next;
    });
  }, []);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <SelectContext.Provider
      value={{ open, setOpen, value, setValue, labels, registerLabel }}
    >
      <div ref={rootRef} className={cn("relative", className)} {...props}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

function SelectGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-1", className)} {...props} />;
}

function SelectValue({
  className,
  placeholder,
  ...props
}: React.ComponentProps<"span"> & { placeholder?: string }) {
  const { value, labels } = useSelectContext("SelectValue");
  const displayValue = value ? labels.get(value) ?? value : placeholder;
  const hasValue = Boolean(displayValue);

  return (
    <span
      data-slot="select-value"
      className={cn(!hasValue && "text-muted-foreground", className)}
      {...props}
    >
      {displayValue}
    </span>
  );
}

function SelectTrigger({
  className,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  size?: "sm" | "default";
}) {
  const { open, setOpen } = useSelectContext("SelectTrigger");

  return (
    <button
      type="button"
      data-slot="select-trigger"
      aria-expanded={open}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setOpen((prev) => !prev);
        }
      }}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pl-2.5 pr-2 text-sm",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </button>
  );
}

function SelectContent({ className, ...props }: React.ComponentProps<"div">) {
  const { open } = useSelectContext("SelectContent");
  if (!open) return null;

  return (
    <div
      data-slot="select-content"
      className={cn(
        "absolute left-0 top-[calc(100%+0.375rem)] z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-2 py-1.5 text-xs font-medium", className)} {...props} />;
}

function SelectItem({
  className,
  children,
  value,
  onClick,
  ...props
}: Omit<React.ComponentProps<"div">, "value"> & { value: string }) {
  const { value: selectedValue, setValue, setOpen, registerLabel } =
    useSelectContext("SelectItem");
  const selected = selectedValue === value;

  React.useEffect(() => {
    if (typeof children === "string") {
      registerLabel(value, children);
    }
  }, [children, registerLabel, value]);

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setValue(value);
          setOpen(false);
        }
      }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    >
      <CheckIcon className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
      <span>{children}</span>
    </div>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

function SelectScrollUpButton(props: React.ComponentProps<"div">) {
  return (
    <div className="flex items-center justify-center py-1" {...props}>
      <ChevronUpIcon className="size-4" />
    </div>
  );
}

function SelectScrollDownButton(props: React.ComponentProps<"div">) {
  return (
    <div className="flex items-center justify-center py-1" {...props}>
      <ChevronDownIcon className="size-4" />
    </div>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
