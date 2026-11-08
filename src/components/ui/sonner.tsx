"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#141413",
          border: "1px solid #262624",
          color: "#EDEDEC",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "0.75rem",
          borderRadius: "2px",
        },
      }}
      {...props}
    />
  );
}
