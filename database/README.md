# Database

EG Digital uses **PostgreSQL** via **Prisma ORM**. The schema, migrations and seed
live in `backend/prisma/`.

## Local development

1. Start PostgreSQL (native install or Docker):

   ```bash
   docker run --name eg-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=egdigital -p 5432:5432 -d postgres:16
   ```

2. Set `DATABASE_URL` in `backend/.env`:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/egdigital?schema=public"
   ```

3. Apply the schema and seed:

   ```bash
   cd backend
   npx prisma migrate dev --name init
   npm run seed
   ```

## Azure Database for PostgreSQL – Flexible Server

```
DATABASE_URL="postgresql://USER:PASSWORD@SERVER.postgres.database.azure.com:5432/egdigital?sslmode=require"
```

- Use `npx prisma migrate deploy` for production (applies committed migrations, never generates).
- SSL is required (`sslmode=require`).
- Keep credentials only in environment variables / Azure App Service configuration — never in source.

## Model overview

`User`, `RefreshToken`, `PasswordResetToken`, `Customer`, `Address`, `Product`,
`CustomerProduct`, `Licence`, `Invoice`, `InvoiceItem`, `Payment`, `ActivityLog`, `Counter`.

Money columns use PostgreSQL `numeric(12,2)` (Prisma `Decimal`) — never floating point.
`Counter` provides race-safe sequences for Client IDs (`EGD-CL-000001`) and invoice numbers.
