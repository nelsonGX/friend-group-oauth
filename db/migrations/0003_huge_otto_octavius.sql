ALTER TABLE "clients" ADD COLUMN "display_title" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "icon_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;