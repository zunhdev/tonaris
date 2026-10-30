-- Backups are Render Postgres's own point-in-time recovery (TS-112, TON-108): nothing records operator backups any more.
DROP TABLE "backup_runs";