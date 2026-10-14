import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Softform: every button is a pill. Lime (`default`) is the one primary action in a view.
const buttonVariants = cva(
  "sf-btn outline-none disabled:pointer-events-none disabled:opacity-45 aria-invalid:shadow-[inset_0_0_0_1.5px_var(--danger)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: "sf-btn--primary",
        destructive: "sf-btn--danger",
        outline: "",
        secondary: "sf-btn--soft",
        ghost: "sf-btn--ghost",
        link: "h-auto bg-transparent px-0 text-signature-ink underline-offset-4 shadow-none hover:underline hover:shadow-none",
      },
      size: {
        default: "",
        xs: "sf-btn--sm h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "sf-btn--sm",
        lg: "sf-btn--lg",
        // Icon-only: a circle, the Softform bubble shape. Callers give it an aria-label.
        icon: "size-11 px-0",
        "icon-xs": "size-6 px-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 px-0",
        "icon-lg": "size-14 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
