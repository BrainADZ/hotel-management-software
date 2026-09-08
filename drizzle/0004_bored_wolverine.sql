CREATE TABLE `damage_policy_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`severity` text NOT NULL,
	`label` text NOT NULL,
	`liability_cap_paise` integer NOT NULL,
	`room_impact` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_damage_policy_property_severity_active` ON `damage_policy_rules` (`property_id`,`severity`) WHERE "damage_policy_rules"."active" = 1;--> statement-breakpoint
ALTER TABLE `damage_reports` ADD `policy_rule_id` text REFERENCES damage_policy_rules(id);--> statement-breakpoint
ALTER TABLE `damage_reports` ADD `policy_label` text;--> statement-breakpoint
ALTER TABLE `damage_reports` ADD `policy_liability_paise` integer;--> statement-breakpoint
ALTER TABLE `damage_reports` ADD `repair_cost_paise` integer;--> statement-breakpoint
ALTER TABLE `damage_reports` ADD `decision_note` text;--> statement-breakpoint
UPDATE `room_inspections`
SET `damage_severity` = CASE `damage_severity` WHEN 'MINOR' THEN 'LOW' WHEN 'MAJOR' THEN 'HIGH' ELSE `damage_severity` END
WHERE `damage_severity` IN ('MINOR', 'MAJOR');--> statement-breakpoint
UPDATE `damage_reports`
SET `severity` = CASE `severity` WHEN 'MINOR' THEN 'LOW' WHEN 'MAJOR' THEN 'HIGH' ELSE `severity` END
WHERE `severity` IN ('MINOR', 'MAJOR');--> statement-breakpoint
INSERT OR IGNORE INTO `damage_policy_rules` (`id`, `property_id`, `severity`, `label`, `liability_cap_paise`, `room_impact`, `active`, `version`, `updated_at`)
SELECT 'damage-policy-low-' || `id`, `id`, 'LOW', 'Cosmetic damage', 250000, 'CLEAN_AFTER_REPAIR', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM `properties`;--> statement-breakpoint
INSERT OR IGNORE INTO `damage_policy_rules` (`id`, `property_id`, `severity`, `label`, `liability_cap_paise`, `room_impact`, `active`, `version`, `updated_at`)
SELECT 'damage-policy-medium-' || `id`, `id`, 'MEDIUM', 'Repair required', 1500000, 'MAINTENANCE_REVIEW', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM `properties`;--> statement-breakpoint
INSERT OR IGNORE INTO `damage_policy_rules` (`id`, `property_id`, `severity`, `label`, `liability_cap_paise`, `room_impact`, `active`, `version`, `updated_at`)
SELECT 'damage-policy-high-' || `id`, `id`, 'HIGH', 'Major repair or replacement', 5000000, 'ROOM_OUT_OF_ORDER', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM `properties`;--> statement-breakpoint
UPDATE `damage_reports`
SET `policy_rule_id` = (SELECT `p`.`id` FROM `damage_policy_rules` `p` WHERE `p`.`property_id` = `damage_reports`.`property_id` AND `p`.`severity` = `damage_reports`.`severity` AND `p`.`active` = 1 LIMIT 1),
    `policy_label` = (SELECT `p`.`label` FROM `damage_policy_rules` `p` WHERE `p`.`property_id` = `damage_reports`.`property_id` AND `p`.`severity` = `damage_reports`.`severity` AND `p`.`active` = 1 LIMIT 1),
    `policy_liability_paise` = (SELECT `p`.`liability_cap_paise` FROM `damage_policy_rules` `p` WHERE `p`.`property_id` = `damage_reports`.`property_id` AND `p`.`severity` = `damage_reports`.`severity` AND `p`.`active` = 1 LIMIT 1)
WHERE `policy_rule_id` IS NULL OR `policy_label` IS NULL OR `policy_liability_paise` IS NULL;
