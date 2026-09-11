"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import type { Surface } from "@/app/hotel-platform";

export function OperatingSurfaceSwitcher({ surface, renderIcon, onToggle }: { surface: Surface; renderIcon: (surface: Surface) => ReactNode; onToggle: () => void }) {
  return <button className="surface-chip" onClick={onToggle}>{renderIcon(surface)} {surface === "MASTER_HUB" ? "Master Hub" : "Property"}<ChevronDown size={13} /></button>;
}
