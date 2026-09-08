CREATE TABLE "guest_identity_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"document_type" text NOT NULL,
	"masked_number" text NOT NULL,
	"issuing_country" text,
	"issued_at" text,
	"expires_at" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"guest_role" text DEFAULT 'ACCOMPANYING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_key_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text NOT NULL,
	"stay_id" text NOT NULL,
	"key_type" text DEFAULT 'CARD' NOT NULL,
	"key_label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"issued_by" text NOT NULL,
	"returned_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stays" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"room_id" text NOT NULL,
	"status" text DEFAULT 'IN_HOUSE' NOT NULL,
	"planned_check_in_at" timestamp with time zone NOT NULL,
	"planned_check_out_at" timestamp with time zone NOT NULL,
	"actual_check_in_at" timestamp with time zone NOT NULL,
	"actual_check_out_at" timestamp with time zone,
	"checked_in_by" text NOT NULL,
	"checked_out_by" text,
	"early_check_in" boolean DEFAULT false NOT NULL,
	"early_check_in_override" boolean DEFAULT false NOT NULL,
	"notes" text,
	"late_checkout_status" text,
	"late_checkout_requested_until" timestamp with time zone,
	"late_checkout_requested_at" timestamp with time zone,
	"late_checkout_requested_by" text,
	"late_checkout_decided_at" timestamp with time zone,
	"late_checkout_decided_by" text,
	"late_checkout_decision_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "organisation_id" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "alternate_phone" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "date_of_birth" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "address_line_1" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "check_in_time" text DEFAULT '14:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "check_out_time" text DEFAULT '11:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "kyc_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "guests" AS g SET "organisation_id" = p."organisation_id", "display_name" = COALESCE(g."display_name", g."full_name"), "first_name" = COALESCE(g."first_name", g."full_name") FROM "properties" AS p WHERE g."property_id" = p."id";--> statement-breakpoint
ALTER TABLE "guests" ALTER COLUMN "organisation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_identity_documents" ADD CONSTRAINT "guest_identity_documents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_identity_documents" ADD CONSTRAINT "guest_identity_documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_identity_documents" ADD CONSTRAINT "guest_identity_documents_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_identity_documents" ADD CONSTRAINT "guest_identity_documents_verified_by_app_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_key_issues" ADD CONSTRAINT "stay_key_issues_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_key_issues" ADD CONSTRAINT "stay_key_issues_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_key_issues" ADD CONSTRAINT "stay_key_issues_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_key_issues" ADD CONSTRAINT "stay_key_issues_issued_by_app_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_in_by_app_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_out_by_app_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_late_checkout_requested_by_app_users_id_fk" FOREIGN KEY ("late_checkout_requested_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_late_checkout_decided_by_app_users_id_fk" FOREIGN KEY ("late_checkout_decided_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guest_identity_tenant_guest" ON "guest_identity_documents" USING btree ("organisation_id","property_id","guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reservation_guests_unique" ON "reservation_guests" USING btree ("reservation_id","guest_id");--> statement-breakpoint
INSERT INTO "reservation_guests" ("id", "organisation_id", "property_id", "reservation_id", "guest_id", "guest_role", "created_at") SELECT 'rg-' || md5(r."id" || ':' || r."guest_id"), r."organisation_id", r."property_id", r."id", r."guest_id", 'PRIMARY', NOW() FROM "reservations" AS r ON CONFLICT ("reservation_id", "guest_id") DO NOTHING;--> statement-breakpoint
CREATE INDEX "idx_reservation_guests_tenant" ON "reservation_guests" USING btree ("organisation_id","property_id","reservation_id");--> statement-breakpoint
CREATE INDEX "idx_stay_keys_tenant_stay" ON "stay_key_issues" USING btree ("organisation_id","property_id","stay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stays_reservation" ON "stays" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "idx_stays_tenant_status" ON "stays" USING btree ("organisation_id","property_id","status");--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guests_org_email" ON "guests" USING btree ("organisation_id","email");
