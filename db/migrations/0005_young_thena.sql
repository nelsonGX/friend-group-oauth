ALTER TABLE "ledger" ADD COLUMN "counterparty_user_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "kind" text DEFAULT 'adjustment' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;