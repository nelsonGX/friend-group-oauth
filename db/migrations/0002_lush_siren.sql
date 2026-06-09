ALTER TABLE "access_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "webhook_status" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "webhook_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "webhook_last_error" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "webhook_delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "access_tokens_family_id_idx" ON "access_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");