CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_unique` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE TABLE `shift_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`report_date` text NOT NULL,
	`shift` text NOT NULL,
	`reporter` text NOT NULL,
	`status` text DEFAULT 'finalizado' NOT NULL,
	`payload` text NOT NULL,
	`deviation_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
