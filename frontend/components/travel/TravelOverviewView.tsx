"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArrowRight, CalendarDays, Check, Download, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { roleCan } from "@hotel/shared/domain";
import { apiUrl } from "@/lib/api/client";
import type { MealService } from "@/lib/offline-db";
import { ProductionFrontDesk, ProductionGuests } from "@/app/production-front-desk";
import { DamageReviewPanel, HousekeepingOverviewView } from "@/components/hotel/HousekeepingView";
import { AppGlyph, AvailabilityGrid, InspectionStatusBadge, Kpi, Metric, MiniModule, PageHeading, ReservationCompact, SandboxBadge, Status, dateTime, downloadBlob, money, mealLabel, mealOptions, productionApi, shortDate, type PlatformViewProps, type Row } from "@/app/hotel-platform";
export function TravelOverviewView({ state, setView }: PlatformViewProps) {
  const pending = state.discountRequests.filter(
    (request) => request.status === "PENDING",
  );
  const recent = state.customPackages.slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="Travel & Sales workspace"
        title={`Good afternoon, ${state.actor.name.split(" ")[0]}.`}
        description="A dedicated view of inquiries, package design, quote guardrails and discount approvals."
        actions={
          <button
            className="primary-button"
            onClick={() => setView("Packages & Tours")}
          >
            <Plus size={16} /> Build custom package
          </button>
        }
      />
      <section className="kpi-grid overview-kpis travel-kpis">
        <Kpi
          icon={<AppGlyph name="travel" size={31} />}
          label="Active tours"
          value={String(state.travelMetrics.activePackages)}
          detail="Scheduled products"
          meta="Travel inventory only"
          tone="blue"
        />
        <Kpi
          icon={<AppGlyph name="inquiry" size={31} />}
          label="Open inquiries"
          value={String(state.travelMetrics.openInquiries)}
          detail="Across the sales pipeline"
          meta={`${state.travelMetrics.overdueFollowUps} follow-ups due`}
          tone="cyan"
        />
        <Kpi
          icon={<AppGlyph name="folio" size={31} />}
          label="Pipeline value"
          value={money(state.travelMetrics.pipelineValuePaise)}
          detail={`${state.travelMetrics.customQuotes} custom quotes`}
          meta="Calculated from live inquiries"
          tone="emerald"
        />
        <Kpi
          icon={<AppGlyph name="policy" size={31} />}
          label="Approvals"
          value={String(state.travelMetrics.pendingApprovals)}
          detail="Below-floor requests"
          meta="Manager governed"
          tone="violet"
        />
      </section>
      <section className="dashboard-grid overview-grid travel-overview-grid">
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Recent custom packages</p>
              <h2>Quotes in progress</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setView("Packages & Tours")}
            >
              Open builder <ArrowRight size={14} />
            </button>
          </div>
          {recent.length ? (
            <div className="travel-quote-list">
              {recent.map((item) => (
                <div key={String(item.id)}>
                  <span>
                    <strong>{String(item.name)}</strong>
                    <small>
                      {String(item.reference)} · {String(item.clientName)}
                    </small>
                  </span>
                  <span>
                    <b>{money(item.quotedPricePaise)}</b>
                    <Status value={String(item.status)} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph name="travel" size={38} />
              <strong>No custom quotes yet</strong>
              <p>Build the first one from approved assets.</p>
            </div>
          )}
        </article>
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Manager guardrails</p>
              <h2>Discount approval queue</h2>
            </div>
            <span>{pending.length} pending</span>
          </div>
          {pending.length ? (
            <div className="approval-preview">
              {pending.slice(0, 3).map((request) => (
                <div key={String(request.id)}>
                  <span>
                    <strong>{String(request.packageName)}</strong>
                    <small>
                      {String(request.requestedByName)} requested{" "}
                      {money(request.requestedPricePaise)}
                    </small>
                  </span>
                  <em>
                    {money(
                      Number(request.floorPricePaise) -
                        Number(request.requestedPricePaise),
                    )}{" "}
                    below floor
                  </em>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph name="policy" size={38} />
              <strong>Pricing is within policy</strong>
              <p>No below-floor approvals are waiting.</p>
            </div>
          )}
        </article>
      </section>
    </>
  );
}
