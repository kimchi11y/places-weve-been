CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`file_name` text NOT NULL,
	`taken_at` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`postcard` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_stop` ON `photos` (`stop_id`);--> statement-breakpoint
CREATE TABLE `stops` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`date` text NOT NULL,
	`story` text NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stops_trip` ON `stops` (`trip_id`,`position`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`countries` text NOT NULL,
	`summary` text NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`vlog` text,
	`draft` integer DEFAULT true NOT NULL,
	`cover_photo_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
