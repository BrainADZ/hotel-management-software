"use client";
import { TravelCatalog } from './TravelCatalog';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Check, Download, Pencil, Plus, Printer, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { apiFetch } from "@/lib/api/client";
import { AppGlyph, PageHeading, SandboxBadge, Status, dateTime, downloadBlob, money, type PlatformViewProps, type AppGlyphName, type Row } from "@/app/hotel-platform";
export function PackagesToursView({
  view,
  productionMode,
  state,
  role,
  command,
  refresh,
  notify,
}: PlatformViewProps) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pricingPackage, setPricingPackage] = useState<Row | null>(null);
  const canManagePricing = ["OWNER", "MANAGER", "TOUR_MANAGER"].includes(role);
  const pendingRequests = state.discountRequests.filter(
    (request) => request.status === "PENDING",
  );
  async function decide(requestId: unknown, decision: "APPROVED" | "REJECTED") {
    try {
      await command({
        action: "RESOLVE_DISCOUNT_REQUEST",
        requestId,
        decision,
      });
      await refresh();
      notify(
        decision === "APPROVED"
          ? "Discount approved and the requested price is ready to send."
          : "Discount rejected; the quote has been returned for repricing.",
      );
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Discount decision could not be saved.",
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Travel / Package studio"
        title="Packages, quotes & approvals"
        description="Build tailored packages from approved assets, price within the manager floor, or send a below-floor discount for approval."
        actions={
          <button
            className="primary-button"
            onClick={() => setBuilderOpen(true)}
          >
            <Plus size={16} /> Build custom package
          </button>
        }
      />
      {productionMode && <TravelCatalog state={state} role={role} command={command} refresh={refresh} notify={notify}/>}
      <section className="pricing-policy-banner">
        <AppGlyph name="policy" size={27} />
        <span>
          <strong>Manager-controlled pricing guardrails</strong>
          <small>
            Sales can quote freely at or above the floor. Any lower price
            creates an approval request instead of silently changing the quote.
          </small>
        </span>
        <b>{canManagePricing ? "Pricing manager" : "Sales guardrail active"}</b>
      </section>
      <div className="subsection-heading">
        <div>
          <p className="section-kicker">Scheduled products</p>
          <h2>Available tours</h2>
        </div>
        <span>{state.packages.length} active</span>
      </div>
      <div className="package-grid">
        {state.packages.map((item) => {
          const fill = Math.round(
            (Number(item.booked) / Number(item.capacity)) * 100,
          );
          return (
            <article className="package-card" key={String(item.id)}>
              <span className="package-icon">
                <AppGlyph name="travel" size={31} />
              </span>
              <Status value={String(item.status)} />
              <h2>{String(item.name)}</h2>
              <p>{String(item.locations)}</p>
              <div className="package-facts">
                <span>
                  <small>Duration</small>
                  <strong>{Number(item.durationDays)} days</strong>
                </span>
                <span>
                  <small>Price</small>
                  <strong>{money(item.sellingPricePaise)}</strong>
                </span>
              </div>
              <div className="capacity-bar">
                <span style={{ width: `${fill}%` }} />
              </div>
              <div className="capacity-copy">
                <span>{Number(item.booked)} booked</span>
                <span>{Number(item.capacity)} capacity</span>
              </div>
            </article>
          );
        })}
      </div>
      <div className="subsection-heading custom-heading">
        <div>
          <p className="section-kicker">Tailored proposals</p>
          <h2>Custom package quotes</h2>
        </div>
        <span>{state.customPackages.length} quotes</span>
      </div>
      {state.customPackages.length ? (
        <div className="custom-package-grid">
          {state.customPackages.map((item) => {
            const packageItems = state.customPackageItems.filter(
              (line) => line.packageId === item.id,
            );
            const discount = Math.max(
              0,
              Math.round(
                (1 -
                  Number(item.quotedPricePaise) /
                    Math.max(Number(item.basePricePaise), 1)) *
                  100,
              ),
            );
            return (
              <article className="custom-package-card" key={String(item.id)}>
                <div className="card-heading">
                  <span>
                    <small>{String(item.reference)}</small>
                    <h3>{String(item.name)}</h3>
                    <p>
                      {String(item.clientName)} · {String(item.ownerName)}
                    </p>
                  </span>
                  <Status value={String(item.status)} />
                </div>
                <div className="asset-chip-list">
                  {packageItems.slice(0, 4).map((line) => (
                    <span key={String(line.id)}>
                      {String(line.assetName)} × {Number(line.quantity)}
                    </span>
                  ))}
                </div>
                <div className="quote-pricing-grid">
                  <span>
                    <small>Asset value</small>
                    <strong>{money(item.assetSubtotalPaise)}</strong>
                  </span>
                  <span>
                    <small>Base / floor</small>
                    <strong>
                      {money(item.basePricePaise)} /{" "}
                      {money(item.floorPricePaise)}
                    </strong>
                  </span>
                  <span>
                    <small>Client quote</small>
                    <strong>{money(item.quotedPricePaise)}</strong>
                    <em>{discount}% discount</em>
                  </span>
                </div>
                {canManagePricing && (
                  <button
                    className="secondary-button"
                    onClick={() => setPricingPackage(item)}
                  >
                    <Pencil size={14} /> Set base & floor
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state glass-card">
          <AppGlyph name="travel" size={44} />
          <strong>No custom package yet</strong>
          <p>
            Start with the approved hotel, transport, dining and experience
            assets.
          </p>
        </div>
      )}
      <section className="approval-section">
        <div className="subsection-heading">
          <div>
            <p className="section-kicker">Price governance</p>
            <h2>Discount approval queue</h2>
          </div>
          <span>{pendingRequests.length} pending</span>
        </div>
        {pendingRequests.length ? (
          <div className="approval-grid">
            {pendingRequests.map((request) => (
              <article key={String(request.id)}>
                <div>
                  <small>{String(request.packageReference)}</small>
                  <h3>{String(request.packageName)}</h3>
                  <p>
                    {String(request.clientName)} · requested by{" "}
                    {String(request.requestedByName)}
                  </p>
                </div>
                <div className="approval-price">
                  <span>
                    <small>Base</small>
                    <strong>{money(request.basePricePaise)}</strong>
                  </span>
                  <span>
                    <small>Floor</small>
                    <strong>{money(request.floorPricePaise)}</strong>
                  </span>
                  <span>
                    <small>Requested</small>
                    <strong>{money(request.requestedPricePaise)}</strong>
                  </span>
                </div>
                <blockquote>{String(request.reason)}</blockquote>
                {canManagePricing ? (
                  <div className="approval-actions">
                    <button
                      className="secondary-button"
                      onClick={() => decide(request.id, "REJECTED")}
                    >
                      <X size={14} /> Reject
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => decide(request.id, "APPROVED")}
                    >
                      <Check size={14} /> Approve
                    </button>
                  </div>
                ) : (
                  <div className="waiting-approval">
                    <AppGlyph name="policy" size={22} /> Waiting for manager
                    decision
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state small glass-card">
            <AppGlyph name="policy" size={40} />
            <strong>No pending discount requests</strong>
            <p>All current quotes are within their approved pricing floor.</p>
          </div>
        )}
      </section>
      {builderOpen && (
        <PackageBuilderModal
          assets={state.travelAssets}
          role={role}
          onClose={() => setBuilderOpen(false)}
          onSubmit={async (payload) => {
            try {
              const result = await command({
                action: "CREATE_CUSTOM_PACKAGE",
                ...payload,
              });
              setBuilderOpen(false);
              await refresh();
              notify(
                result.status === "DISCOUNT_REQUESTED"
                  ? `${result.reference} saved and sent for manager discount approval.`
                  : `${result.reference} is priced and ready to send.`,
              );
            } catch (cause) {
              notify(
                cause instanceof Error
                  ? cause.message
                  : "Custom package could not be saved.",
              );
            }
          }}
        />
      )}
      {pricingPackage && (
        <PackagePricingModal
          item={pricingPackage}
          onClose={() => setPricingPackage(null)}
          onSubmit={async (payload) => {
            try {
              await command({
                action: "SET_PACKAGE_PRICING",
                packageId: pricingPackage.id,
                ...payload,
              });
              setPricingPackage(null);
              await refresh();
              notify(
                "Base and floor pricing updated; stale approvals were closed automatically.",
              );
            } catch (cause) {
              notify(
                cause instanceof Error
                  ? cause.message
                  : "Pricing could not be updated.",
              );
            }
          }}
        />
      )}
    </>
  );
}

function PackageBuilderModal({
  assets,
  role,
  onClose,
  onSubmit,
}: {
  assets: Row[];
  role: AppRole;
  onClose: () => void;
  onSubmit: (payload: Row) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    clientName: "",
    name: "",
    baseRupees: 0,
    floorRupees: 0,
    quoteRupees: 0,
    discountReason: "",
  });
  const [busy, setBusy] = useState(false);
  const canManage = ["OWNER", "MANAGER", "TOUR_MANAGER"].includes(role);
  const assetSubtotalPaise = assets.reduce(
    (sum, asset) =>
      sum + (selected[String(asset.id)] ?? 0) * Number(asset.unitPricePaise),
    0,
  );
  const basePaise =
    canManage && form.baseRupees > 0
      ? Math.round(form.baseRupees * 100)
      : assetSubtotalPaise;
  const floorPaise =
    canManage && form.floorRupees > 0
      ? Math.round(form.floorRupees * 100)
      : Math.round(basePaise * 0.9);
  const quotePaise =
    form.quoteRupees > 0 ? Math.round(form.quoteRupees * 100) : basePaise;
  const belowFloor = quotePaise > 0 && quotePaise < floorPaise && !canManage;
  function toggle(assetId: string) {
    setSelected((current) => {
      const next = { ...current };
      if (next[assetId]) delete next[assetId];
      else next[assetId] = 1;
      return next;
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        clientName: form.clientName,
        name: form.name,
        basePricePaise: basePaise,
        floorPricePaise: floorPaise,
        quotedPricePaise: quotePaise,
        discountReason: form.discountReason,
        assetSelections: Object.entries(selected).map(
          ([assetId, quantity]) => ({ assetId, quantity }),
        ),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="modal-card package-builder-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Custom package studio</p>
            <h2>Build from available assets</h2>
            <p>
              Select operational assets first; the server recalculates every
              price before saving.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="builder-layout">
          <section>
            <h3>1. Client brief</h3>
            <div className="form-grid">
              <label>
                <span>Client name</span>
                <input
                  required
                  value={form.clientName}
                  onChange={(event) =>
                    setForm({ ...form, clientName: event.target.value })
                  }
                  placeholder="Client or group"
                />
              </label>
              <label>
                <span>Package name</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Tailored Rajasthan escape"
                />
              </label>
            </div>
            <h3>2. Available assets</h3>
            <div className="asset-selector">
              {assets.map((asset) => {
                const assetId = String(asset.id);
                const quantity = selected[assetId] ?? 0;
                return (
                  <div key={assetId} className={quantity ? "selected" : ""}>
                    <button type="button" onClick={() => toggle(assetId)}>
                      <span className="asset-check">
                        {quantity ? <Check size={13} /> : <Plus size={13} />}
                      </span>
                      <span>
                        <strong>{String(asset.name)}</strong>
                        <small>
                          {String(asset.category)} · {String(asset.pricingUnit)}
                        </small>
                      </span>
                      <b>{money(asset.unitPricePaise)}</b>
                    </button>
                    {quantity > 0 && (
                      <label>
                        <span>Qty</span>
                        <input
                          aria-label={`${String(asset.name)} quantity`}
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          value={quantity}
                          onChange={(event) =>
                            setSelected({
                              ...selected,
                              [assetId]: Math.max(
                                1,
                                Math.min(99, Number(event.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <aside className="pricing-sidebar">
            <h3>3. Pricing guardrail</h3>
            <div className="pricing-summary">
              <span>
                <small>Selected asset value</small>
                <strong>{money(assetSubtotalPaise)}</strong>
              </span>
              {canManage && (
                <>
                  <label>
                    <span>Manager base price (₹)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.baseRupees}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          baseRupees: Number(event.target.value),
                        })
                      }
                      placeholder={String(assetSubtotalPaise / 100)}
                    />
                  </label>
                  <label>
                    <span>Lowest allowed price (₹)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.floorRupees}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          floorRupees: Number(event.target.value),
                        })
                      }
                      placeholder={String(
                        Math.round(assetSubtotalPaise * 0.9) / 100,
                      )}
                    />
                  </label>
                </>
              )}
              <span>
                <small>Base price</small>
                <strong>{money(basePaise)}</strong>
              </span>
              <span>
                <small>Sales floor</small>
                <strong>{money(floorPaise)}</strong>
              </span>
              <label>
                <span>Client quote (₹)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quoteRupees}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      quoteRupees: Number(event.target.value),
                    })
                  }
                  placeholder={String(basePaise / 100)}
                />
              </label>
            </div>
            {belowFloor && (
              <label className="discount-reason">
                <span>Reason for below-floor request</span>
                <textarea
                  required
                  minLength={5}
                  value={form.discountReason}
                  onChange={(event) =>
                    setForm({ ...form, discountReason: event.target.value })
                  }
                  placeholder="Commercial reason and approval context"
                />
              </label>
            )}
            <div
              className={`pricing-decision ${belowFloor ? "needs-approval" : ""}`}
            >
              <AppGlyph name="policy" size={24} />
              <span>
                <strong>
                  {belowFloor
                    ? "Manager approval required"
                    : "Within approved pricing"}
                </strong>
                <small>
                  {belowFloor
                    ? `${money(floorPaise - quotePaise)} below the current floor`
                    : "This quote can be sent without a discount request."}
                </small>
              </span>
            </div>
          </aside>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || assetSubtotalPaise <= 0}
          >
            {busy
              ? "Saving package…"
              : belowFloor
                ? "Save & request approval"
                : "Save package quote"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PackagePricingModal({
  item,
  onClose,
  onSubmit,
}: {
  item: Row;
  onClose: () => void;
  onSubmit: (payload: Row) => Promise<void>;
}) {
  const [baseRupees, setBaseRupees] = useState(
    Number(item.basePricePaise) / 100,
  );
  const [floorRupees, setFloorRupees] = useState(
    Number(item.floorPricePaise) / 100,
  );
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        basePricePaise: Math.round(baseRupees * 100),
        floorPricePaise: Math.round(floorRupees * 100),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="modal-card compact-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Manager pricing</p>
            <h2>Set base & lowest price</h2>
            <p>
              {String(item.reference)} · {String(item.name)}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            <span>Base price (₹)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={baseRupees}
              onChange={(event) => setBaseRupees(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Lowest sales price (₹)</span>
            <input
              type="number"
              min="0"
              max={baseRupees}
              step="1"
              value={floorRupees}
              onChange={(event) => setFloorRupees(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || floorRupees > baseRupees}
          >
            {busy ? "Saving policy…" : "Save pricing policy"}
          </button>
        </div>
      </form>
    </div>
  );
}
