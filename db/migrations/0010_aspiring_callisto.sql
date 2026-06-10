CREATE TABLE "app_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_data" ADD CONSTRAINT "app_data_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_data" ADD CONSTRAINT "app_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_data_app_key_idx" ON "app_data" USING btree ("client_id","key") WHERE "app_data"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "app_data_user_key_idx" ON "app_data" USING btree ("client_id","user_id","key") WHERE "app_data"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "app_data_scope_idx" ON "app_data" USING btree ("client_id","user_id");