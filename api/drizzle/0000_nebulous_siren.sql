CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atto_login" text NOT NULL,
	"atto_login_normalized" text NOT NULL,
	"name" text NOT NULL,
	"atto_sid" text,
	"customer_sid" text,
	"is_root" boolean DEFAULT false NOT NULL,
	"atto_roles" jsonb,
	"password_hash" text,
	"token_encrypted" text,
	"token_obtained_at" timestamp with time zone,
	"token_expires_at" timestamp with time zone,
	"token_invalidated_at" timestamp with time zone,
	"last_signin_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_atto_login_normalized_unique" UNIQUE("atto_login_normalized"),
	CONSTRAINT "users_atto_login_normalized" CHECK ("users"."atto_login_normalized" = lower(btrim("users"."atto_login")))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;