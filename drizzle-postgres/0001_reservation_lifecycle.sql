CREATE TABLE "reservation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"event_type" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"performed_by" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_sequences" (
	"property_id" text PRIMARY KEY NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "organisation_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "primary_guest_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "source_reference" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "adults" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "children" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "nightly_rate_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "tax_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "estimated_total_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "special_requests" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "no_show_by" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "created_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "updated_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_performed_by_app_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_sequences" ADD CONSTRAINT "reservation_sequences_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reservation_events_tenant_reservation_time" ON "reservation_events" USING btree ("organisation_id","property_id","reservation_id","created_at");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_app_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_show_by_app_users_id_fk" FOREIGN KEY ("no_show_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_updated_by_app_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;