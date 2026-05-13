# Database dumps

Generated SQL dumps land here when you run:

```bash
npm run db:dump                      # full schema + data
npm run db:dump -- --schema-only     # schema only
npm run db:dump -- --data-only       # data only
```

Files are named `smart-docs-<UTC-timestamp>.sql` so dumps never overwrite each
other.

**This folder is gitignored.** Dumps contain real student data — share them
out-of-band (USB, encrypted Google Drive folder, email attachment) with the
party that needs them.

## Restoring a dump

On a target Postgres / Supabase database with `DATABASE_URL` set:

```bash
psql "$env:DATABASE_URL" -f db-dumps\smart-docs-2026-05-13T12-00-00-000Z.sql
```

(Use `cmd` `%DATABASE_URL%` on Windows non-PowerShell shells.)
