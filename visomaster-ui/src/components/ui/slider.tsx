import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueChange,
  onValueCommit,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  // Internal display value — tracks the thumb position on every drag tick
  // so the slider feels responsive, but we only forward to onValueChange
  // once the pointer is released (via onValueCommit).
  const [displayValue, setDisplayValue] = React.useState<number[] | undefined>(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : undefined)
  )

  // Keep display value in sync when the controlled value changes externally
  // (e.g. a parameter reset or a backend state update).
  React.useEffect(() => {
    if (Array.isArray(value)) setDisplayValue(value)
  }, [value])

  const handleValueChange = (next: number[]) => {
    // Update the visual position immediately — no backend call yet.
    setDisplayValue(next)
  }

  const handleValueCommit = (next: number[]) => {
    // Pointer released — now propagate to the parent handler.
    onValueChange?.(next)
    onValueCommit?.(next)
  }

  const _values = React.useMemo(
    () =>
      Array.isArray(displayValue)
        ? displayValue
        : Array.isArray(value)
          ? value
          : Array.isArray(defaultValue)
            ? defaultValue
            : [min, max],
    [displayValue, value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={displayValue ?? value}
      min={min}
      max={max}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-none bg-muted data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="relative block size-3 shrink-0 rounded-none border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-1 focus-visible:ring-1 focus-visible:outline-hidden active:ring-1 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
