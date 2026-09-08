CREATE TABLE `damage_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`room_id` text NOT NULL,
	`folio_id` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`charge_amount_paise` integer,
	`folio_line_id` text,
	`reported_by` text NOT NULL,
	`reported_at` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inspection_id`) REFERENCES `room_inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_damage_reports_inspection` ON `damage_reports` (`inspection_id`);--> statement-breakpoint
CREATE INDEX `idx_damage_reports_property_status` ON `damage_reports` (`property_id`,`status`,`reported_at`);--> statement-breakpoint
CREATE TABLE `restaurant_meal_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`service_date` text NOT NULL,
	`meal_period` text NOT NULL,
	`guest_count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'BOOKED' NOT NULL,
	`dietary_notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_restaurant_meal_reservation_date_period` ON `restaurant_meal_bookings` (`reservation_id`,`service_date`,`meal_period`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_meal_property_date_period` ON `restaurant_meal_bookings` (`property_id`,`service_date`,`meal_period`);--> statement-breakpoint
CREATE TABLE `room_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`task_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`room_id` text NOT NULL,
	`result` text NOT NULL,
	`notes` text,
	`damage_severity` text,
	`completed_by` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `housekeeping_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_room_inspections_task` ON `room_inspections` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_room_inspections_reservation` ON `room_inspections` (`reservation_id`,`completed_at`);--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `reservation_id` text REFERENCES reservations(id);--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `task_type` text DEFAULT 'STAY_SERVICE' NOT NULL;--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `deferred_until` text;--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `housekeeping_tasks` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_housekeeping_reservation_type` ON `housekeeping_tasks` (`reservation_id`,`task_type`);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `department` text DEFAULT 'HOTEL' NOT NULL;