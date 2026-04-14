"use client"

/**
 * components/ui/slider.tsx
 *
 * Shadcn/ui Slider component wrapping @radix-ui/react-slider.
 * @radix-ui/react-slider@^1.1.2 is already declared in package.json.
 *
 * Usage:
 *   <Slider
 *     min={0}
 *     max={2}
 *     step={0.01}
 *     defaultValue={[0.7]}
 *     onValueChange={(val) => setTemperature(val[0])}
 *   />
 *
 * Supports single thumb (value/defaultValue as number[]) and range mode
 * (two elements in the array). Radix handles all keyboard and ARIA behavior.
 *
 * All standard @radix-ui/react-slider Root props are forwarded via spread.
 */

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    {/* Track - the full background bar */}
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      {/* Range - the filled portion */}
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>

    {/*
      Render one thumb per value in the value/defaultValue array.
      When no value prop is provided, default to a single thumb.
      Radix internally manages thumb count from the value array length.
    */}
    {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        className={cn(
          "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      />
    ))}
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
