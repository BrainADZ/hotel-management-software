"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { NavigationGroup } from "@/lib/navigation";

type AppSidebarProps = {
  collapsed: boolean;
  menuOpen: boolean;
  pathname: string;
  groups: NavigationGroup[];
  brand: ReactNode;
  workspaceSwitcher: ReactNode;
  verificationCount: number;
  renderIcon: (label: NavigationGroup["items"][number]["label"]) => ReactNode;
  onCollapse: () => void;
  onExpand: () => void;
  onNavigate: () => void;
};

export function AppSidebar({
  collapsed,
  menuOpen,
  pathname,
  groups,
  brand,
  workspaceSwitcher,
  verificationCount,
  renderIcon,
  onCollapse,
  onExpand,
  onNavigate,
}: AppSidebarProps) {
  return (
    <aside
      className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}
      aria-label="Main navigation"
    >
      <div className="brand-lockup">
        {brand}
        {!collapsed && (
          <button
            type="button"
            className="icon-button sidebar-collapse-button"
            aria-label="Collapse sidebar"
            aria-expanded
            aria-controls="sidebar-navigation"
            onClick={onCollapse}
          >
            <ChevronLeft size={17} />
          </button>
        )}
      </div>

      {workspaceSwitcher}

      <nav id="sidebar-navigation">
        {groups.map((group) => (
          <section key={group.label} className="nav-group">
            <p>{group.label}</p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`nav-item ${item.href === pathname ? "active" : ""}`}
                aria-current={item.href === pathname ? "page" : undefined}
                onClick={onNavigate}
              >
                {renderIcon(item.label)}
                <span>{item.label}</span>
                {item.label === "Verification" && verificationCount > 0 && (
                  <i className="warn">{verificationCount}</i>
                )}
              </Link>
            ))}
          </section>
        ))}
      </nav>

      <div className="sidebar-foot">
        {collapsed ? (
          <button
            type="button"
            className="icon-button sidebar-expand-button"
            aria-label="Expand sidebar"
            aria-expanded={false}
            aria-controls="sidebar-navigation"
            onClick={onExpand}
          >
            <ChevronRight size={19} />
          </button>
        ) : (
          <span>
            <small>Developed by</small>
            <strong>BrainADZ Software</strong>
          </span>
        )}
      </div>
    </aside>
  );
}
