"use client";

import { Check, ChevronDown } from "lucide-react";
import type { BusinessUnit } from "@hotel/shared/domain";
import type { ReactNode, RefObject } from "react";

type Props = {
  containerRef: RefObject<HTMLDivElement | null>;
  businessUnit: BusinessUnit;
  availableUnits: readonly BusinessUnit[];
  open: boolean;
  canSwitch: boolean;
  renderIcon: (unit: BusinessUnit, size: number) => ReactNode;
  onToggle: () => void;
  onChange: (unit: BusinessUnit) => void;
};

export function WorkspaceSwitcher({ containerRef, businessUnit, availableUnits, open, canSwitch, renderIcon, onToggle, onChange }: Props) {
  return (
    <div ref={containerRef} className="workspace-switcher-container" style={{ position: "relative" }}>
      <button type="button" aria-label={businessUnit === "HOTEL" ? "Hotel Operations workspace" : "Travel & Sales workspace"} aria-haspopup="menu" aria-expanded={open} className="property-switcher property-switch-button workspace-switcher" disabled={!canSwitch} onClick={onToggle}>
        <span className="property-icon">{renderIcon(businessUnit, 28)}</span>
        <span><small>Business workspace</small><strong>{businessUnit === "HOTEL" ? "Hotel Operations" : "Travel & Sales"}</strong></span>
        {canSwitch && <ChevronDown size={15} />}
      </button>
      {open && canSwitch && (
        <section role="menu" aria-label="Choose business workspace" className="workspace-switcher-menu" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 80, padding: 8, borderRadius: 12, background: "var(--surface, #ffffff)", border: "1px solid var(--border, rgba(15, 23, 42, 0.12))", boxShadow: "0 14px 36px rgba(15, 23, 42, 0.18)" }}>
          {availableUnits.map((unit) => {
            const selected = unit === businessUnit;
            return <button key={unit} type="button" role="menuitemradio" aria-checked={selected} onClick={() => onChange(unit)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: 0, borderRadius: 9, background: selected ? "rgba(37, 99, 235, 0.10)" : "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}>
              <span className="property-icon">{renderIcon(unit, 24)}</span>
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}><strong>{unit === "HOTEL" ? "Hotel Operations" : "Travel & Sales"}</strong><small>{unit === "HOTEL" ? "Rooms, reservations and hotel operations" : "Tours, inquiries and sales operations"}</small></span>
              {selected && <Check size={16} aria-hidden="true" />}
            </button>;
          })}
        </section>
      )}
    </div>
  );
}
