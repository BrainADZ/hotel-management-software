CREATE TABLE `custom_travel_package_items` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`asset_name` text NOT NULL,
	`category` text NOT NULL,
	`pricing_unit` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`line_total_paise` integer NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `custom_travel_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `travel_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_custom_package_items_package` ON `custom_travel_package_items` (`package_id`);--> statement-breakpoint
CREATE TABLE `custom_travel_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`reference` text NOT NULL,
	`client_name` text NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`asset_subtotal_paise` integer NOT NULL,
	`base_price_paise` integer NOT NULL,
	`floor_price_paise` integer NOT NULL,
	`quoted_price_paise` integer NOT NULL,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_packages_org_reference` ON `custom_travel_packages` (`organisation_id`,`reference`);--> statement-breakpoint
CREATE INDEX `idx_custom_packages_org_status` ON `custom_travel_packages` (`organisation_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `travel_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`pricing_unit` text NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_travel_assets_org_active` ON `travel_assets` (`organisation_id`,`active`,`category`);--> statement-breakpoint
CREATE TABLE `travel_discount_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`package_id` text NOT NULL,
	`package_version` integer NOT NULL,
	`requested_by_id` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`requested_price_paise` integer NOT NULL,
	`base_price_paise` integer NOT NULL,
	`floor_price_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`reviewed_by_id` text,
	`reviewed_by_name` text,
	`decision_note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `custom_travel_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_discount_requests_org_status` ON `travel_discount_requests` (`organisation_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discount_requests_package_version` ON `travel_discount_requests` (`package_id`,`package_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_provider_reference` ON `integration_events` (`provider`,`provider_reference`);