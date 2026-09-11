"use client";

import type { ReactNode } from "react";

export function Topbar({ children }: { children: ReactNode }) {
  return <header className="topbar">{children}</header>;
}
