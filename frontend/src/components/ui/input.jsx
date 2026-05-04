import * as React from "react"

import { cn } from "@/lib/utils"

// Types whose native picker should pop on click. Inside vaul drawers / radix
// dialogs the browser's auto-open-on-focus heuristic gets swallowed, so we
// trigger showPicker() ourselves.
const PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"])

const Input = React.forwardRef(({ className, type, onClick, ...props }, ref) => {
  const handleClick = (e) => {
    if (PICKER_TYPES.has(type) && typeof e.currentTarget.showPicker === "function") {
      try { e.currentTarget.showPicker() } catch { /* not supported / blocked */ }
    }
    onClick?.(e)
  }

  return (
    <input
      type={type}
      onClick={handleClick}
      className={cn(
        "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-base shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-slate-300 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        PICKER_TYPES.has(type) && "cursor-pointer",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
