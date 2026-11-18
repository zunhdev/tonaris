CREATE TABLE "people_hidden" (
	"user_id" uuid,
	"person_id" uuid,
	"hidden_at" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_hidden_pkey" PRIMARY KEY("user_id","person_id")
);
--> statement-breakpoint
CREATE INDEX "people_hidden_person_id_index" ON "people_hidden" ("person_id");--> statement-breakpoint
ALTER TABLE "people_hidden" ADD CONSTRAINT "people_hidden_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "people_hidden" ADD CONSTRAINT "people_hidden_person_id_user_id_fkey" FOREIGN KEY ("person_id") REFERENCES "user"("id");