CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`property_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_org_email` ON `app_users` (`organisation_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_users_property_role` ON `app_users` (`property_id`,`role`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`role` text NOT NULL,
	`property_id` text,
	`device_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`previous_value` text,
	`new_value` text,
	`source` text NOT NULL,
	`correlation_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_property_time` ON `audit_logs` (`property_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `folio_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`folio_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_amount_paise` integer NOT NULL,
	`tax_rate_bps` integer NOT NULL,
	`line_total_paise` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_folio_lines_folio` ON `folio_lines` (`folio_id`);--> statement-breakpoint
CREATE TABLE `folios` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`status` text NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`tax_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_folios_reservation` ON `folios` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `idx_folios_property_status` ON `folios` (`property_id`,`status`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`city` text,
	`preferences` text,
	`dietary_requirements` text,
	`loyalty_tier` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_guests_property_name` ON `guests` (`property_id`,`full_name`);--> statement-breakpoint
CREATE INDEX `idx_guests_property_phone` ON `guests` (`property_id`,`phone`);--> statement-breakpoint
CREATE TABLE `housekeeping_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text NOT NULL,
	`assigned_to` text,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_housekeeping_property_status` ON `housekeeping_tasks` (`property_id`,`status`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`reference` text NOT NULL,
	`customer_name` text NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`service` text NOT NULL,
	`estimated_value_paise` integer NOT NULL,
	`status` text NOT NULL,
	`follow_up_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inquiries_org_reference` ON `inquiries` (`organisation_id`,`reference`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_org_status` ON `inquiries` (`organisation_id`,`status`);--> statement-breakpoint
CREATE TABLE `integration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`provider_reference` text,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_integration_events_provider_status` ON `integration_events` (`provider`,`status`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`current_quantity` integer NOT NULL,
	`minimum_quantity` integer NOT NULL,
	`unit_cost_paise` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_property_category` ON `inventory_items` (`property_id`,`category`);--> statement-breakpoint
CREATE TABLE `maintenance_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text,
	`category` text NOT NULL,
	`issue` text NOT NULL,
	`severity` text NOT NULL,
	`assigned_to` text,
	`status` text NOT NULL,
	`opened_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_maintenance_property_status` ON `maintenance_tickets` (`property_id`,`status`);--> statement-breakpoint
CREATE TABLE `offline_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`offline_reference` text NOT NULL,
	`reservation_id` text NOT NULL,
	`booking_reference` text NOT NULL,
	`guest_id` text NOT NULL,
	`device_id` text NOT NULL,
	`generated_by` text NOT NULL,
	`local_amount_paise` integer NOT NULL,
	`tax_paise` integer NOT NULL,
	`cloud_amount_paise` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`status` text NOT NULL,
	`document_hash` text NOT NULL,
	`notes` text,
	`generated_at` text NOT NULL,
	`verified_at` text,
	`verified_by` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_offline_bills_property_reference` ON `offline_bills` (`property_id`,`offline_reference`);--> statement-breakpoint
CREATE INDEX `idx_offline_bills_reservation_status` ON `offline_bills` (`reservation_id`,`status`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`timezone` text NOT NULL,
	`connection_status` text DEFAULT 'ONLINE' NOT NULL,
	`last_sync_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_properties_org_code` ON `properties` (`organisation_id`,`code`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`reference` text NOT NULL,
	`guest_id` text NOT NULL,
	`room_id` text,
	`room_type` text NOT NULL,
	`arrival_date` text NOT NULL,
	`departure_date` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`total_amount_paise` integer NOT NULL,
	`balance_paise` integer NOT NULL,
	`created_while_property_offline` integer DEFAULT false NOT NULL,
	`contact_status` text DEFAULT 'NOT_CONTACTED' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservations_property_reference` ON `reservations` (`property_id`,`reference`);--> statement-breakpoint
CREATE INDEX `idx_reservations_property_dates` ON `reservations` (`property_id`,`arrival_date`,`departure_date`);--> statement-breakpoint
CREATE INDEX `idx_reservations_property_status` ON `reservations` (`property_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_guest` ON `reservations` (`guest_id`);--> statement-breakpoint
CREATE TABLE `restaurant_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`reservation_id` text,
	`room_number` text,
	`order_type` text NOT NULL,
	`status` text NOT NULL,
	`total_paise` integer NOT NULL,
	`payment_status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_restaurant_property_status` ON `restaurant_orders` (`property_id`,`status`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`number` text NOT NULL,
	`floor` integer NOT NULL,
	`room_type` text NOT NULL,
	`base_rate_paise` integer NOT NULL,
	`occupancy_status` text NOT NULL,
	`operational_status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rooms_property_number` ON `rooms` (`property_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_rooms_property_status` ON `rooms` (`property_id`,`occupancy_status`,`operational_status`);--> statement-breakpoint
CREATE TABLE `travel_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`duration_days` integer NOT NULL,
	`locations` text NOT NULL,
	`capacity` integer NOT NULL,
	`booked` integer NOT NULL,
	`selling_price_paise` integer NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_packages_org_status` ON `travel_packages` (`organisation_id`,`status`);