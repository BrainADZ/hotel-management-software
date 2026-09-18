"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Check, Download, Pencil, Plus, Printer, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { apiFetch } from "@/lib/api/client";
import { AppGlyph, PageHeading, SandboxBadge, Status, dateTime, downloadBlob, money, type PlatformViewProps, type AppGlyphName, type Row } from "@/app/hotel-platform";
export function ReportsView({ state, notify, businessUnit }: PlatformViewProps) {
  if (businessUnit === "TRAVEL") {
    const travelRows = [
      {
        metric: "Active tours",
        value: String(state.travelMetrics.activePackages),
      },
      {
        metric: "Open inquiries",
        value: String(state.travelMetrics.openInquiries),
      },
      {
        metric: "Pipeline value",
        value: money(state.travelMetrics.pipelineValueRupees),
      },
      {
        metric: "Custom quotes",
        value: String(state.travelMetrics.customQuotes),
      },
      {
        metric: "Pending approvals",
        value: String(state.travelMetrics.pendingApprovals),
      },
      {
        metric: "Overdue follow-ups",
        value: String(state.travelMetrics.overdueFollowUps),
      },
    ];
    function exportTravelCsv() {
      const csv = [
        "Metric,Value",
        ...travelRows.map((row) => `"${row.metric}","${row.value}"`),
      ].join("\n");
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `brainadz-travel-sales-report-${new Date().toISOString().slice(0,10)}.csv`,
      );
      notify("Travel & Sales report exported to CSV.");
    }
    return (
      <>
        <PageHeading
          eyebrow="Travel / Reports"
          title="Sales & package performance"
          description="Travel-only pipeline, custom quote and approval figures."
          actions={
            <button className="primary-button" onClick={exportTravelCsv}>
              <Download size={15} /> Export CSV
            </button>
          }
        />
        <section className="report-grid">
          <article className="glass-card report-chart">
            <p className="section-kicker">Pipeline health</p>
            <h2>Inquiry & approval status</h2>
            <div className="bar-chart">
              <div>
                <span>Open inquiries</span>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, state.travelMetrics.openInquiries * 18)}%`,
                    }}
                  />
                </i>
                <strong>{state.travelMetrics.openInquiries}</strong>
              </div>
              <div>
                <span>Custom quotes</span>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, state.travelMetrics.customQuotes * 20)}%`,
                    }}
                  />
                </i>
                <strong>{state.travelMetrics.customQuotes}</strong>
              </div>
              <div>
                <span>Pending approvals</span>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, state.travelMetrics.pendingApprovals * 25)}%`,
                    }}
                  />
                </i>
                <strong>{state.travelMetrics.pendingApprovals}</strong>
              </div>
            </div>
          </article>
          <article className="glass-card report-table">
            <p className="section-kicker">Calculated summary</p>
            {travelRows.map((row) => (
              <div key={row.metric}>
                <span>{row.metric}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </article>
        </section>
      </>
    );
  }
  const reportRows = [
    { metric: "Occupancy", value: `${state.metrics.occupancyPercent}%` },
    { metric: "ADR", value: money(state.metrics.adrRupees) },
    { metric: "RevPAR", value: money(state.metrics.revParRupees) },
    { metric: "Folio charges (including tax)", value: money(state.metrics.revenueRupees) },
    { metric: "Arrivals", value: String(state.metrics.arrivalsToday) },
    { metric: "Departures", value: String(state.metrics.departuresToday) },
    { metric: "Low-stock items", value: String(state.metrics.lowStockCount) },
    {
      metric: "Open maintenance",
      value: String(state.metrics.unresolvedMaintenance),
    },
  ];
  function exportCsv() {
    const csv = [
      "Metric,Value",
      ...reportRows.map((row) => `"${row.metric}","${row.value}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `brainadz-hospitality-operational-report-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Calculated operational report exported to CSV.");
  }
  return (
    <>
      <PageHeading
        eyebrow="Reports"
        title="Operating performance"
        description="Every figure below is calculated from current application records."
        actions={
          <>
            <button className="secondary-button" onClick={() => window.print()}>
              <Printer size={15} /> Print report
            </button>
            <button className="primary-button" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </button>
          </>
        }
      />
      <section className="report-grid">
        <article className="glass-card report-chart">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Room performance</p>
              <h2>Occupancy, ADR & RevPAR</h2>
            </div>
            <span className="date-chip">{new Date().toLocaleDateString('en-IN')}</span>
          </div>
          <div className="bar-chart">
            <div>
              <span>Occupancy</span>
              <i>
                <b style={{ width: `${state.metrics.occupancyPercent}%` }} />
              </i>
              <strong>{state.metrics.occupancyPercent}%</strong>
            </div>
            <div>
              <span>ADR</span>
              <i>
                <b style={{ width: `${Math.max(0, state.metrics.adrRupees) / Math.max(1, state.metrics.adrRupees, state.metrics.revParRupees) * 100}%` }} />
              </i>
              <strong>{money(state.metrics.adrRupees)}</strong>
            </div>
            <div>
              <span>RevPAR</span>
              <i>
                <b style={{ width: `${Math.max(0, state.metrics.revParRupees) / Math.max(1, state.metrics.adrRupees, state.metrics.revParRupees) * 100}%` }} />
              </i>
              <strong>{money(state.metrics.revParRupees)}</strong>
            </div>
          </div>
        </article>
        <article className="glass-card report-table">
          <p className="section-kicker">Calculated summary</p>
          {reportRows.map((row) => (
            <div key={row.metric}>
              <span>{row.metric}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}
