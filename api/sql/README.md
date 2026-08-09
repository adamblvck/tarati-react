# Database roles & grants (run once, by hand, as an admin)

These scripts create least-privilege login roles for the Tarati API and grant
them runtime access. They are **not** Drizzle migrations — run them manually
against the shared PostgreSQL instance (through the bastion tunnel) as a
superuser/admin, before applying migrations.

## Prerequisites

1. Open the tunnel: `npm run api:tunnel` (forwards `localhost:5432` to the DB).
2. Create the databases (as admin), if they don't exist yet:

   ```sql
   CREATE DATABASE tarati_dev;
   CREATE DATABASE tarati_prd;
   ```

## Order

1. `00_create_api_roles.sql` — connect to any DB as admin. Replace `**PWD DEV**`
   and `**PWD PRD**` with strong passwords first. Creates `tarati_api_dev` and
   `tarati_api_prd`.
2. `10_grants_dev_database.sql` — connect **to `tarati_dev`** as admin.
3. `11_grants_prd_database.sql` — connect **to `tarati_prd`** as admin.

## Then apply the schema

With the tunnel up and `DATABASE_URL` (or `DATABASE_URL_DEV`) pointing at
`tarati_dev`:

```bash
npm run api:db:generate   # author SQL migrations from src/db/schema.ts
npm run api:db:migrate    # apply them
```

The role passwords you set here go into `DATABASE_URL_DEV` / `DATABASE_URL_PRD`
(e.g. `postgresql://tarati_api_dev:<pwd>@localhost:5432/tarati_dev`).
