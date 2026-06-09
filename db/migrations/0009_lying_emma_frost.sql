CREATE TABLE "login_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_token_hash" text NOT NULL,
	"public_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"last_polled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_handoffs_poll_token_hash_unique" UNIQUE("poll_token_hash"),
	CONSTRAINT "login_handoffs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "login_handoffs" ADD CONSTRAINT "login_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_handoffs_public_id_idx" ON "login_handoffs" USING btree ("public_id");