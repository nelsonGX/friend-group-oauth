CREATE TABLE "crypto_deposit_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"derivation_index" integer NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_deposit_addresses_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "crypto_deposit_addresses_derivation_index_unique" UNIQUE("derivation_index"),
	CONSTRAINT "crypto_deposit_addresses_address_unique" UNIQUE("address"),
	CONSTRAINT "crypto_deposit_addresses_index_nonnegative" CHECK ("crypto_deposit_addresses"."derivation_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crypto_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"from_address" text,
	"value_micros" bigint NOT NULL,
	"credits" integer NOT NULL,
	"block_number" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_deposits_value_micros_positive" CHECK ("crypto_deposits"."value_micros" > 0),
	CONSTRAINT "crypto_deposits_credits_positive" CHECK ("crypto_deposits"."credits" > 0)
);
--> statement-breakpoint
ALTER TABLE "crypto_deposit_addresses" ADD CONSTRAINT "crypto_deposit_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_deposits_user_id_idx" ON "crypto_deposits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_deposits_chain_tx_idx" ON "crypto_deposits" USING btree ("chain_id","tx_hash");