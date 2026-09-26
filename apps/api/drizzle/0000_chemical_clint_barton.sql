-- citext（大文字小文字を区別しない文字列型）は拡張機能。
-- users.email で使っているが、Drizzle は型が拡張に依存していることを
-- 知らないためこの DDL を生成しない。生成後に手で追加している。
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"hired_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('employee', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"scheduled_start" time NOT NULL,
	"scheduled_end" time NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedules_user_effective_unique" UNIQUE("user_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_schedules_user_effective_idx" ON "work_schedules" USING btree ("user_id","effective_from" desc);