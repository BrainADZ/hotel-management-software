CREATE TABLE "night_audit_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "organisation_id" text NOT NULL,
    "property_id" text NOT NULL,
    "business_date" text NOT NULL,
    "status" text DEFAULT 'IN_PROGRESS' NOT NULL,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "started_by" text NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" text,

    "room_revenue_paise" integer DEFAULT 0 NOT NULL,
    "other_revenue_paise" integer DEFAULT 0 NOT NULL,
    "tax_paise" integer DEFAULT 0 NOT NULL,
    "payments_paise" integer DEFAULT 0 NOT NULL,
    "refunds_paise" integer DEFAULT 0 NOT NULL,
    "outstanding_paise" integer DEFAULT 0 NOT NULL,

    "room_nights_posted" integer DEFAULT 0 NOT NULL,
    "pending_arrivals" integer DEFAULT 0 NOT NULL,
    "pending_departures" integer DEFAULT 0 NOT NULL,
    "open_folios" integer DEFAULT 0 NOT NULL,

    "snapshot" jsonb,
    "failure_reason" text,

    CONSTRAINT "chk_night_audit_status"
        CHECK (
            "status" IN (
                'IN_PROGRESS',
                'COMPLETED',
                'FAILED'
            )
        ),

    CONSTRAINT "chk_night_audit_attempt_count"
        CHECK ("attempt_count" >= 1),

    CONSTRAINT "chk_night_audit_counts_nonnegative"
        CHECK (
            "room_nights_posted" >= 0
            AND "pending_arrivals" >= 0
            AND "pending_departures" >= 0
            AND "open_folios" >= 0
        )
);

--> statement-breakpoint

/*
 * Existing properties already contain data.
 *
 * Add business_date nullable first, populate it according
 * to each property's own configured timezone, and only
 * then enforce NOT NULL.
 */
ALTER TABLE "properties"
ADD COLUMN "business_date" text;

--> statement-breakpoint

UPDATE "properties"
SET "business_date" = (
    CURRENT_TIMESTAMP AT TIME ZONE "timezone"
)::date::text
WHERE "business_date" IS NULL;

--> statement-breakpoint

ALTER TABLE "properties"
ALTER COLUMN "business_date" SET NOT NULL;

--> statement-breakpoint

ALTER TABLE "night_audit_runs"
ADD CONSTRAINT "night_audit_runs_organisation_id_organisations_id_fk"
FOREIGN KEY ("organisation_id")
REFERENCES "public"."organisations"("id")
ON DELETE no action
ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "night_audit_runs"
ADD CONSTRAINT "night_audit_runs_property_id_properties_id_fk"
FOREIGN KEY ("property_id")
REFERENCES "public"."properties"("id")
ON DELETE no action
ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "night_audit_runs"
ADD CONSTRAINT "night_audit_runs_started_by_app_users_id_fk"
FOREIGN KEY ("started_by")
REFERENCES "public"."app_users"("id")
ON DELETE no action
ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "night_audit_runs"
ADD CONSTRAINT "night_audit_runs_completed_by_app_users_id_fk"
FOREIGN KEY ("completed_by")
REFERENCES "public"."app_users"("id")
ON DELETE no action
ON UPDATE no action;

--> statement-breakpoint

CREATE UNIQUE INDEX "idx_night_audit_property_business_date"
ON "night_audit_runs"
USING btree ("property_id", "business_date");

--> statement-breakpoint

CREATE INDEX "idx_night_audit_property_status"
ON "night_audit_runs"
USING btree ("property_id", "status");