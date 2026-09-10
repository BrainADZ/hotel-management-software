CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"property_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"auth_provider" text,
	"auth_subject" text,
	"updated_at" text,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"role" text NOT NULL,
	"property_id" text,
	"device_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"source" text NOT NULL,
	"correlation_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_travel_package_items" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"asset_name" text NOT NULL,
	"category" text NOT NULL,
	"pricing_unit" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"line_total_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_travel_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"reference" text NOT NULL,
	"client_name" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"asset_subtotal_paise" integer NOT NULL,
	"base_price_paise" integer NOT NULL,
	"floor_price_paise" integer NOT NULL,
	"quoted_price_paise" integer NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"severity" text NOT NULL,
	"label" text NOT NULL,
	"liability_cap_paise" integer NOT NULL,
	"room_impact" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"inspection_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"room_id" text NOT NULL,
	"folio_id" text NOT NULL,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"policy_rule_id" text,
	"policy_label" text,
	"policy_liability_paise" integer,
	"repair_cost_paise" integer,
	"charge_amount_paise" integer,
	"folio_line_id" text,
	"decision_note" text,
	"reported_by" text NOT NULL,
	"reported_at" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folio_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"folio_id" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount_paise" integer NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"line_total_paise" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folios" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"status" text NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"preferences" text,
	"dietary_requirements" text,
	"loyalty_tier" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "housekeeping_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"room_id" text NOT NULL,
	"reservation_id" text,
	"assigned_to" text,
	"task_type" text DEFAULT 'STAY_SERVICE' NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"scheduled_at" text NOT NULL,
	"deferred_until" text,
	"completed_at" text,
	"updated_at" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"reference" text NOT NULL,
	"customer_name" text NOT NULL,
	"source" text NOT NULL,
	"owner" text NOT NULL,
	"service" text NOT NULL,
	"estimated_value_paise" integer NOT NULL,
	"status" text NOT NULL,
	"follow_up_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"provider_reference" text,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"department" text DEFAULT 'HOTEL' NOT NULL,
	"unit" text NOT NULL,
	"current_quantity" integer NOT NULL,
	"minimum_quantity" integer NOT NULL,
	"unit_cost_paise" integer NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"room_id" text,
	"category" text NOT NULL,
	"issue" text NOT NULL,
	"severity" text NOT NULL,
	"assigned_to" text,
	"status" text NOT NULL,
	"opened_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"offline_reference" text NOT NULL,
	"reservation_id" text NOT NULL,
	"booking_reference" text NOT NULL,
	"guest_id" text NOT NULL,
	"device_id" text NOT NULL,
	"generated_by" text NOT NULL,
	"local_amount_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"cloud_amount_paise" integer,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text NOT NULL,
	"document_hash" text NOT NULL,
	"notes" text,
	"generated_at" text NOT NULL,
	"verified_at" text,
	"verified_by" text
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"timezone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" text,
	"connection_status" text DEFAULT 'ONLINE' NOT NULL,
	"last_sync_at" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"reference" text NOT NULL,
	"guest_id" text NOT NULL,
	"room_id" text,
	"room_type" text NOT NULL,
	"arrival_date" text NOT NULL,
	"departure_date" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"total_amount_paise" integer NOT NULL,
	"balance_paise" integer NOT NULL,
	"created_while_property_offline" boolean DEFAULT false NOT NULL,
	"contact_status" text DEFAULT 'NOT_CONTACTED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_meal_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"service_date" text NOT NULL,
	"meal_period" text NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"dietary_notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"reservation_id" text,
	"room_number" text,
	"order_type" text NOT NULL,
	"status" text NOT NULL,
	"total_paise" integer NOT NULL,
	"payment_status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"task_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"room_id" text NOT NULL,
	"result" text NOT NULL,
	"notes" text,
	"damage_severity" text,
	"completed_by" text NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"number" text NOT NULL,
	"floor" integer NOT NULL,
	"room_type" text NOT NULL,
	"base_rate_paise" integer NOT NULL,
	"occupancy_status" text NOT NULL,
	"operational_status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"pricing_unit" text NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_discount_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"package_id" text NOT NULL,
	"package_version" integer NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"requested_price_paise" integer NOT NULL,
	"base_price_paise" integer NOT NULL,
	"floor_price_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"reviewed_by_id" text,
	"reviewed_by_name" text,
	"decision_note" text,
	"created_at" text NOT NULL,
	"decided_at" text
);
--> statement-breakpoint
CREATE TABLE "travel_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"duration_days" integer NOT NULL,
	"locations" text NOT NULL,
	"capacity" integer NOT NULL,
	"booked" integer NOT NULL,
	"selling_price_paise" integer NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_travel_package_items" ADD CONSTRAINT "custom_travel_package_items_package_id_custom_travel_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."custom_travel_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_travel_package_items" ADD CONSTRAINT "custom_travel_package_items_asset_id_travel_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."travel_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_travel_packages" ADD CONSTRAINT "custom_travel_packages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_policy_rules" ADD CONSTRAINT "damage_policy_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_inspection_id_room_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."room_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_policy_rule_id_damage_policy_rules_id_fk" FOREIGN KEY ("policy_rule_id") REFERENCES "public"."damage_policy_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bills" ADD CONSTRAINT "offline_bills_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bills" ADD CONSTRAINT "offline_bills_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bills" ADD CONSTRAINT "offline_bills_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_meal_bookings" ADD CONSTRAINT "restaurant_meal_bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_meal_bookings" ADD CONSTRAINT "restaurant_meal_bookings_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inspections" ADD CONSTRAINT "room_inspections_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inspections" ADD CONSTRAINT "room_inspections_task_id_housekeeping_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."housekeeping_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inspections" ADD CONSTRAINT "room_inspections_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inspections" ADD CONSTRAINT "room_inspections_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_assets" ADD CONSTRAINT "travel_assets_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_discount_requests" ADD CONSTRAINT "travel_discount_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_discount_requests" ADD CONSTRAINT "travel_discount_requests_package_id_custom_travel_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."custom_travel_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_packages" ADD CONSTRAINT "travel_packages_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_auth_identity" ON "app_users" USING btree ("auth_provider","auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_org_email" ON "app_users" USING btree ("organisation_id","email");--> statement-breakpoint
CREATE INDEX "idx_users_property_role" ON "app_users" USING btree ("property_id","role");--> statement-breakpoint
CREATE INDEX "idx_audit_property_time" ON "audit_logs" USING btree ("property_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idx_custom_package_items_package" ON "custom_travel_package_items" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_custom_packages_org_reference" ON "custom_travel_packages" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "idx_custom_packages_org_status" ON "custom_travel_packages" USING btree ("organisation_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_damage_policy_property_severity_active" ON "damage_policy_rules" USING btree ("property_id","severity") WHERE "damage_policy_rules"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_damage_reports_inspection" ON "damage_reports" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "idx_damage_reports_property_status" ON "damage_reports" USING btree ("property_id","status","reported_at");--> statement-breakpoint
CREATE INDEX "idx_folio_lines_folio" ON "folio_lines" USING btree ("folio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_folios_reservation" ON "folios" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "idx_folios_property_status" ON "folios" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "idx_guests_property_name" ON "guests" USING btree ("property_id","full_name");--> statement-breakpoint
CREATE INDEX "idx_guests_property_phone" ON "guests" USING btree ("property_id","phone");--> statement-breakpoint
CREATE INDEX "idx_housekeeping_property_status" ON "housekeeping_tasks" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "idx_housekeeping_reservation_type" ON "housekeeping_tasks" USING btree ("reservation_id","task_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_housekeeping_unique_checkout_inspection" ON "housekeeping_tasks" USING btree ("reservation_id","task_type") WHERE "housekeeping_tasks"."task_type" = 'CHECKOUT_INSPECTION';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inquiries_org_reference" ON "inquiries" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "idx_inquiries_org_status" ON "inquiries" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "idx_integration_events_provider_status" ON "integration_events" USING btree ("provider","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_integration_provider_reference" ON "integration_events" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "idx_inventory_property_category" ON "inventory_items" USING btree ("property_id","category");--> statement-breakpoint
CREATE INDEX "idx_maintenance_property_status" ON "maintenance_tickets" USING btree ("property_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_offline_bills_property_reference" ON "offline_bills" USING btree ("property_id","offline_reference");--> statement-breakpoint
CREATE INDEX "idx_offline_bills_reservation_status" ON "offline_bills" USING btree ("reservation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_properties_org_code" ON "properties" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reservations_property_reference" ON "reservations" USING btree ("property_id","reference");--> statement-breakpoint
CREATE INDEX "idx_reservations_property_dates" ON "reservations" USING btree ("property_id","arrival_date","departure_date");--> statement-breakpoint
CREATE INDEX "idx_reservations_property_status" ON "reservations" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "idx_reservations_guest" ON "reservations" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_restaurant_meal_reservation_date_period" ON "restaurant_meal_bookings" USING btree ("reservation_id","service_date","meal_period");--> statement-breakpoint
CREATE INDEX "idx_restaurant_meal_property_date_period" ON "restaurant_meal_bookings" USING btree ("property_id","service_date","meal_period");--> statement-breakpoint
CREATE INDEX "idx_restaurant_property_status" ON "restaurant_orders" USING btree ("property_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_room_inspections_task" ON "room_inspections" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_room_inspections_reservation" ON "room_inspections" USING btree ("reservation_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rooms_property_number" ON "rooms" USING btree ("property_id","number");--> statement-breakpoint
CREATE INDEX "idx_rooms_property_status" ON "rooms" USING btree ("property_id","occupancy_status","operational_status");--> statement-breakpoint
CREATE INDEX "idx_travel_assets_org_active" ON "travel_assets" USING btree ("organisation_id","active","category");--> statement-breakpoint
CREATE INDEX "idx_discount_requests_org_status" ON "travel_discount_requests" USING btree ("organisation_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_discount_requests_package_version" ON "travel_discount_requests" USING btree ("package_id","package_version");--> statement-breakpoint
CREATE INDEX "idx_packages_org_status" ON "travel_packages" USING btree ("organisation_id","status");