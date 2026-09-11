"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function PropertiesSettingsView(props: ExtraFeatureProps) {
  const { state, notify } = props;
  return (
    <>
      <Heading
        title="Properties & settings"
        description="Primary property profile, operating times, tax defaults, connection and notification preferences."
      />
      <section className="extra-two-column">
        <article className="glass-card settings-card">
          <h2>{state.property.name}</h2>
          <dl>
            <div>
              <dt>City</dt>
              <dd>{state.property.city}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                <Status value={state.property.connectionStatus} />
              </dd>
            </div>
            <div>
              <dt>Check-in</dt>
              <dd>14:00</dd>
            </div>
            <div>
              <dt>Check-out</dt>
              <dd>11:00</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>INR (₹)</dd>
            </div>
            <div>
              <dt>Tax rate</dt>
              <dd>18%</dd>
            </div>
          </dl>
        </article>
        <article className="glass-card settings-card">
          <h2>Workspace preferences</h2>
          <label>
            <span>Reservation notifications</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Room-ready notifications</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Low-stock alerts</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Compact tables</span>
            <input type="checkbox" />
          </label>
          <button
            className="primary-button"
            onClick={() => notify("Property settings saved for this session.")}
          >
            Save settings
          </button>
        </article>
      </section>
    </>
  );
}
