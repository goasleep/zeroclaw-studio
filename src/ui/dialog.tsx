import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  onOpenChange: (open: boolean) => void;
}

export function Dialog({ open, title, children, className = "", onOpenChange }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#000010]/75 backdrop-blur-md" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-50 w-[calc(100vw-3rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 outline-none ${className}`}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
