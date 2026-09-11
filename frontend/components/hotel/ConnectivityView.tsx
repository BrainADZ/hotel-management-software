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
export function ConnectivityView({ state, changeNetwork }: PlatformViewProps) {
  const offlineCreated = state.reservations.filter((reservation) =>
    Boolean(reservation.createdWhilePropertyOffline),
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="Master Hub / Connectivity"
        title="Property connection control"
        description="Monitor registered devices and synchronization health."
      />
      <section className="detail-grid">
        <article className="glass-card connectivity-detail">
          <div className="connectivity-hero">
            <div
              className={`signal-orbit ${state.property.connectionStatus === "OFFLINE" ? "signal-off" : ""}`}
            >
              <AppGlyph
                name={
                  state.property.connectionStatus === "ONLINE"
                    ? "cloud-network"
                    : "offline"
                }
                size={42}
              />
            </div>
            <div>
              <p>{state.property.name}</p>
              <h2>{state.property.connectionStatus}</h2>
              <span>
                Last successful sync {dateTime(state.property.lastSyncAt)}
              </span>
            </div>
          </div>
          <div className="connection-facts">
            <div>
              <small>Cloud reservations since outage</small>
              <strong>{offlineCreated}</strong>
            </div>
            <div>
              <small>Offline bills awaiting review</small>
              <strong>
                {
                  state.offlineBills.filter(
                    (bill) => bill.status !== "VERIFIED",
                  ).length
                }
              </strong>
            </div>
            <div>
              <small>Registered device</small>
              <strong>BHZ-FD01</strong>
            </div>
          </div>
          <button
            className={`network-button ${state.property.connectionStatus === "OFFLINE" ? "restore" : ""}`}
            onClick={() =>
              changeNetwork(
                state.property.connectionStatus === "ONLINE"
                  ? "OFFLINE"
                  : "ONLINE",
              )
            }
          >
            {state.property.connectionStatus === "ONLINE"
              ? "Put hotel terminal offline"
              : "Reconnect property terminal"}
          </button>
        </article>
        <article className="glass-card architecture-card">
          <p className="section-kicker">Authority model</p>
          <h2>One source of truth</h2>
          <div className="authority-flow">
            <div>
              <AppGlyph name="cloud-network" size={26} />
              <span>
                <strong>Master Hub</strong>
                <small>Reservations · inventory · payments</small>
              </span>
            </div>
            <ArrowRight size={18} />
            <div>
              <AppGlyph name="hotel" size={26} />
              <span>
                <strong>Hotel online</strong>
                <small>Normal PMS operations</small>
              </span>
            </div>
            <ArrowRight size={18} />
            <div>
              <AppGlyph name="offline" size={26} />
              <span>
                <strong>Hotel offline</strong>
                <small>Cached stays, local walk-ins and PDF billing</small>
              </span>
            </div>
          </div>
          <div className="control-note">
            <AppGlyph name="policy" size={25} />
            <span>
              <strong>Controlled reconciliation</strong>
              <small>
                Local documents and walk-ins are reviewed after reconnection.
              </small>
            </span>
          </div>
        </article>
      </section>
    </>
  );
}
