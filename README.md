# EG Digital — SaaS Platform

A production-oriented, premium white-theme SaaS platform for **EG Digital**. This phase delivers a fully functional **Super Admin Panel** while architecting Client, Supplier and Employee modules for future activation.

## Architecture

```
Digital Saas/
├── backend/     # Node.js + TypeScript + Express + Prisma (REST API)
├── frontend/    # React + TypeScript + Vite + Tailwind + shadcn/ui
└── database/    # PostgreSQL notes / SQL helpers
```

- **Frontend**: React 19, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui, Lucide, Recharts, TanStack Query, React Hook Form, Zod, Axios, date-fns.
- **Backend**: Express, TypeScript, Prisma ORM, PostgreSQL, JWT (access + refresh), argon2 hashing, Zod validation, Helmet, CORS, rate limiting, structured logging, centralized error handling.
- **Pattern**: `Route → Controller → Service → Prisma`. No business logic in routes.
- **Money**: Prisma `Decimal` / Postgres `numeric` — never JS floating point for persisted financials.
- **Locale/Currency defaults**: `en-AU` / `AUD`.

## Prerequisites

- Node.js 20+ (tested on 24)
- PostgreSQL 14+ (local) or **Azure Database for PostgreSQL – Flexible Server**

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, JWT secrets, SUPER_ADMIN_*
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed                  # creates Super Admin + dev seed data
npm run dev                   # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # set VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                   # http://localhost:5173
```

Login at `/login` with the `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` you set in `backend/.env`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. Never commit `.env`.

## Azure Database for PostgreSQL – Flexible Server

Set `DATABASE_URL` with SSL:

```
DATABASE_URL="postgresql://USER:PASSWORD@SERVER.postgres.database.azure.com:5432/egdigital?sslmode=require"
```

- Run `npx prisma migrate deploy` for production migrations (not `migrate dev`).
- File storage uses an abstraction (`src/services/storage`) — local disk in dev, Azure Blob in production via `AZURE_STORAGE_CONNECTION_STRING`.

## Deployment (Azure)

| Layer     | Service                                     |
|-----------|---------------------------------------------|
| Frontend  | Azure Static Web Apps                       |
| Backend   | Azure App Service                           |
| Database  | Azure Database for PostgreSQL – Flexible    |
| Storage   | Azure Blob Storage                          |
| Email     | Azure Communication Services / SendGrid/SMTP|

All environment-specific config comes from environment variables. No local filesystem assumptions in production.

## Commands

Backend: `npm run dev`, `npm run build`, `npm start`, `npm run seed`, `npm run prisma:studio`.
Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

## License

Proprietary — EG Digital.
