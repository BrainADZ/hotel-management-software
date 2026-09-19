"use client";

import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  PageHeading,
  dateTime,
  money,
  productionApi,
  type PlatformViewProps,
} from "@/app/hotel-platform";

import {
  roleCan,
} from "@hotel/shared/domain";

type Blocker = {
  code: string;
  message: string;
  count: number;
};

type RoomNight = {
  reservationId: string;
  reference: string;
  guestName: string;
  roomNumber: string | null;
  folioId: string | null;
  folioStatus: string | null;
  alreadyPosted: boolean;
  nightlyRateRupees: number;
  taxRateBps: number;
  projectedSubtotalRupees: number;
  projectedTaxRupees: number;
  projectedTotalRupees: number;
  existingSubtotalRupees: number;
  existingTaxRupees: number;
  existingTotalRupees: number;
};

type NightAuditPreview = {
  property: {
    id: string;
    name: string;
    timezone: string;
  };

  businessDate: string;
  propertyCalendarDate: string;
  businessDateLagDays: number;

  existingRun: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;

  canClose: boolean;

  blockers: Blocker[];

  summary: {
    pendingArrivals: number;
    pendingDepartures: number;
    inHouseRoomNights: number;
    roomNightsAlreadyPosted: number;
    roomNightsToPost: number;
    openFolios: number;
    outstandingRupees: number;
    projectedRoomRevenueRupees: number;
    projectedRoomTaxRupees: number;
    projectedRoomTotalRupees: number;
    postedRoomRevenueRupees: number;
    postedRoomTaxRupees: number;
  };

  roomNights: RoomNight[];
};

type CloseResult = {
  id: string;
  status: string;
  businessDate: string;
  nextBusinessDate: string;
  roomNightsExpected: number;
  roomNightsPosted: number;
  roomNightsPostedNow: number;
  roomRevenueRupees: number;
  otherRevenueRupees: number;
  taxRupees: number;
  paymentsRupees: number;
  refundsRupees: number;
  outstandingRupees: number;
  openFolios: number;
  completedAt: string;
};

export function NightAuditView({
  role,
  productionMode,
  propertyRestricted,
  refresh,
  notify,
}: PlatformViewProps) {
  const [preview, setPreview] =
    useState<NightAuditPreview | null>(
      null,
    );

  const [lastClose, setLastClose] =
    useState<CloseResult | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [closing, setClosing] =
    useState(false);

  const [error, setError] =
    useState("");

  const loadPreview =
    useCallback(async () => {
      if (!productionMode) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const result =
          await productionApi(
            "/api/night-audit",
          );

        setPreview(
          result as unknown as NightAuditPreview,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Night Audit preview could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }, [productionMode]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function closeNightAudit() {
    if (
      !preview ||
      !preview.canClose ||
      closing
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Close business date ${preview.businessDate}?\n\nThis will post all pending room-night charges and advance the property business date.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setClosing(true);
      setError("");

      const result =
        await productionApi(
          "/api/night-audit",
          {
            method: "POST",
          },
        );

      const closed =
        result as unknown as CloseResult;

      setLastClose(closed);

      notify(
        `Night Audit closed for ${closed.businessDate}. Business date advanced to ${closed.nextBusinessDate}.`,
      );

      await refresh();
      await loadPreview();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Night Audit could not be closed.";

      setError(message);
      notify(message);

      await loadPreview();
    } finally {
      setClosing(false);
    }
  }

  if (!productionMode) {
    return (
      <>
        <PageHeading
          eyebrow="Administration / Night Audit"
          title="Night Audit"
          description="Night Audit is available in production mode."
        />

        <section className="empty-state glass-card">
          <h2>Production mode required</h2>
          <p>
            Business-date closing and
            financial posting are disabled
            in demo mode.
          </p>
        </section>
      </>
    );
  }

  if (propertyRestricted) {
    return (
      <>
        <PageHeading
          eyebrow="Administration / Night Audit"
          title="Night Audit"
          description="Close the hotel's financial business date."
        />

        <section className="empty-state glass-card">
          <h2>Connection required</h2>
          <p>
            Night Audit cannot run while
            this property terminal is
            offline.
          </p>
        </section>
      </>
    );
  }

  const canRun =
    roleCan(
      role,
      "night_audit.run",
    );

  return (
    <>
      <PageHeading
        eyebrow="Administration / Night Audit"
        title="Night Audit"
        description="Review unresolved operations, post the current business-date room revenue and close the hotel day."
        actions={
          <button
            type="button"
            className="secondary-button"
            disabled={
              loading ||
              closing
            }
            onClick={() =>
              void loadPreview()
            }
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <section className="glass-card">
          <p>
            Loading Night Audit
            preview...
          </p>
        </section>
      ) : preview ? (
        <>
          <section className="report-grid">
            <article className="glass-card report-table">
              <p className="section-kicker">
                Business date
              </p>

              <div>
                <span>Business date</span>
                <strong>
                  {preview.businessDate}
                </strong>
              </div>

              <div>
                <span>
                  Property calendar date
                </span>
                <strong>
                  {
                    preview.propertyCalendarDate
                  }
                </strong>
              </div>

              <div>
                <span>
                  Business-date lag
                </span>
                <strong>
                  {
                    preview.businessDateLagDays
                  }{" "}
                  day(s)
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  {preview.canClose
                    ? "READY TO CLOSE"
                    : "ACTION REQUIRED"}
                </strong>
              </div>
            </article>

            <article className="glass-card report-table">
              <p className="section-kicker">
                Operational checks
              </p>

              <div>
                <span>
                  Pending arrivals
                </span>
                <strong>
                  {
                    preview.summary
                      .pendingArrivals
                  }
                </strong>
              </div>

              <div>
                <span>
                  Pending departures
                </span>
                <strong>
                  {
                    preview.summary
                      .pendingDepartures
                  }
                </strong>
              </div>

              <div>
                <span>
                  In-house room nights
                </span>
                <strong>
                  {
                    preview.summary
                      .inHouseRoomNights
                  }
                </strong>
              </div>

              <div>
                <span>
                  Room nights to post
                </span>
                <strong>
                  {
                    preview.summary
                      .roomNightsToPost
                  }
                </strong>
              </div>

              <div>
                <span>Open folios</span>
                <strong>
                  {
                    preview.summary
                      .openFolios
                  }
                </strong>
              </div>
            </article>

            <article className="glass-card report-table">
              <p className="section-kicker">
                Financial preview
              </p>

              <div>
                <span>
                  Room revenue to post
                </span>
                <strong>
                  {money(
                    preview.summary
                      .projectedRoomRevenueRupees,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Projected room tax
                </span>
                <strong>
                  {money(
                    preview.summary
                      .projectedRoomTaxRupees,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Projected total
                </span>
                <strong>
                  {money(
                    preview.summary
                      .projectedRoomTotalRupees,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Current outstanding
                </span>
                <strong>
                  {money(
                    preview.summary
                      .outstandingRupees,
                  )}
                </strong>
              </div>
            </article>
          </section>

          {preview.blockers.length >
            0 && (
            <section className="glass-card">
              <p className="section-kicker">
                Close blockers
              </p>

              <h2>
                Resolve before closing
              </h2>

              {preview.blockers.map(
                blocker => (
                  <div
                    className="error-banner"
                    key={
                      blocker.code
                    }
                  >
                    <AlertTriangle
                      size={17}
                    />

                    <span>
                      <strong>
                        {blocker.count} ×{" "}
                        {blocker.code}
                      </strong>
                      {" — "}
                      {
                        blocker.message
                      }
                    </span>
                  </div>
                ),
              )}
            </section>
          )}

          <section className="glass-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">
                  Room-night posting
                </p>

                <h2>
                  In-house room nights
                </h2>
              </div>

              <strong>
                {
                  preview.roomNights
                    .length
                }{" "}
                night(s)
              </strong>
            </div>

            {preview.roomNights
              .length === 0 ? (
              <p>
                No in-house room-night
                charges are due for this
                business date.
              </p>
            ) : (
              <div className="report-table">
                {preview.roomNights.map(
                  item => (
                    <div
                      key={
                        item.reservationId
                      }
                    >
                      <span>
                        {item.reference}
                        {" · "}
                        {item.guestName}
                        {" · Room "}
                        {item.roomNumber ??
                          "Not assigned"}
                      </span>

                      <strong>
                        {item.alreadyPosted
                          ? `Posted ${money(
                              item.existingTotalRupees,
                            )}`
                          : `To post ${money(
                              item.projectedTotalRupees,
                            )}`}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>

          {lastClose && (
            <section className="glass-card">
              <div className="card-heading">
                <div>
                  <p className="section-kicker">
                    Last close
                  </p>

                  <h2>
                    Business date{" "}
                    {
                      lastClose.businessDate
                    }{" "}
                    closed
                  </h2>
                </div>

                <CheckCircle2
                  size={24}
                />
              </div>

              <div className="report-table">
                <div>
                  <span>
                    Room nights posted
                  </span>
                  <strong>
                    {
                      lastClose.roomNightsPosted
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Room revenue
                  </span>
                  <strong>
                    {money(
                      lastClose.roomRevenueRupees,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Tax</span>
                  <strong>
                    {money(
                      lastClose.taxRupees,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Payments</span>
                  <strong>
                    {money(
                      lastClose.paymentsRupees,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Refunds</span>
                  <strong>
                    {money(
                      lastClose.refundsRupees,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    New business date
                  </span>
                  <strong>
                    {
                      lastClose.nextBusinessDate
                    }
                  </strong>
                </div>

                <div>
                  <span>Completed</span>
                  <strong>
                    {dateTime(
                      lastClose.completedAt,
                    )}
                  </strong>
                </div>
              </div>
            </section>
          )}

          <section className="glass-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">
                  Day close
                </p>

                <h2>
                  Close{" "}
                  {preview.businessDate}
                </h2>

                <p>
                  This operation is
                  transactional. Room-night
                  posting and business-date
                  rollover succeed or fail
                  together.
                </p>
              </div>

              <button
                type="button"
                className="primary-button"
                disabled={
                  !canRun ||
                  !preview.canClose ||
                  closing
                }
                onClick={() =>
                  void closeNightAudit()
                }
              >
                <CheckCircle2
                  size={16}
                />

                {closing
                  ? "Closing..."
                  : "Close Night Audit"}
              </button>
            </div>

            {!canRun && (
              <p>
                Your role can view Night
                Audit but cannot close the
                business date.
              </p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}