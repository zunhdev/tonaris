CREATE TABLE "account_settings" (
	"account_id" uuid PRIMARY KEY,
	"list_sort_mode" text NOT NULL,
	"list_sort_dir" text NOT NULL,
	"folder_sort_mode" text NOT NULL,
	"folder_sort_dir" text NOT NULL,
	"grouped" boolean NOT NULL,
	"layout" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_settings_list_sort_mode_check" CHECK ("list_sort_mode" in ('year', 'name', 'manual')),
	CONSTRAINT "account_settings_list_sort_dir_check" CHECK ("list_sort_dir" in ('asc', 'desc')),
	CONSTRAINT "account_settings_folder_sort_mode_check" CHECK ("folder_sort_mode" in ('name', 'created', 'manual')),
	CONSTRAINT "account_settings_folder_sort_dir_check" CHECK ("folder_sort_dir" in ('asc', 'desc')),
	CONSTRAINT "account_settings_layout_check" CHECK ("layout" in ('rows', 'grid'))
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "view_prefs" ADD CONSTRAINT "view_prefs_sort_mode_check" CHECK ("sort_mode" in ('year', 'name', 'created', 'manual'));--> statement-breakpoint
ALTER TABLE "view_prefs" ADD CONSTRAINT "view_prefs_sort_check" CHECK (("sort_mode" is null) = ("sort_dir" is null));