# EG Digital — GitHub + Azure Deployment Guide

Stack mapping:

| Layer    | Azure service                                  |
|----------|------------------------------------------------|
| Frontend | Azure Static Web Apps                          |
| Backend  | Azure App Service (Linux, Node 22)             |
| Database | Azure Database for PostgreSQL – Flexible Server|
| Files    | Azure Blob Storage (optional, `STORAGE_DRIVER=azure`) |

---

## 0. Prerequisites

```bash
node -v      # >= 20
az --version # Azure CLI — https://aka.ms/installazurecli
gh --version # optional, GitHub CLI
az login
az account set --subscription "<SUBSCRIPTION_ID>"
```

---

## 1. Push project to GitHub

This folder should be its **own** repository (parent `E:\website` repo mein mat daalein).

```bash
cd "E:/website/Digital Saas"
git init
git add .
git commit -m "Initial commit: EG Digital SaaS platform"
git branch -M main

# GitHub CLI se (easiest)
gh repo create eg-digital --private --source=. --remote=origin --push

# ya manually: GitHub par khaali repo banayein, phir
# git remote add origin https://github.com/<user>/eg-digital.git
# git push -u origin main
```

Check karein ki `.env` files commit **nahi** hui:
```bash
git ls-files | grep -i "\.env$"   # output khaali hona chahiye
```

---

## 2. Azure resources banayein

```bash
RG=eg-digital-rg
LOC=australiaeast
PG=eg-digital-pg          # globally unique hona chahiye
API=eg-digital-api        # globally unique hona chahiye
PLAN=eg-digital-plan
PGADMIN=egadmin
PGPASS='<StrongPassword!2026>'

az group create -n $RG -l $LOC
```

### 2a. PostgreSQL Flexible Server

Agar server pehle se hai to ye step skip karke sirf firewall + database check karein.

```bash
az postgres flexible-server create \
  --resource-group $RG --name $PG --location $LOC \
  --admin-user $PGADMIN --admin-password "$PGPASS" \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 --version 16 \
  --public-access 0.0.0.0

az postgres flexible-server db create -g $RG -s $PG -d egdigital

# Azure services (App Service) ko connect karne do
az postgres flexible-server firewall-rule create \
  -g $RG -n $PG --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Apna local IP (migrations/psql local se chalane ke liye)
az postgres flexible-server firewall-rule create \
  -g $RG -n $PG --rule-name MyLaptop \
  --start-ip-address <YOUR_IP> --end-ip-address <YOUR_IP>
```

Connection string (SSL mandatory hai):

```
postgresql://egadmin:<PASSWORD>@eg-digital-pg.postgres.database.azure.com:5432/egdigital?sslmode=require
```

> Password mein `@ : / ?` jaise characters ho to URL-encode karein (`@` → `%40`).

### 2b. App Service (backend)

```bash
az appservice plan create -g $RG -n $PLAN --is-linux --sku B1
az webapp create -g $RG -p $PLAN -n $API --runtime "NODE:22-lts"

# hum node_modules ke saath zip bhej rahe hain -> Oryx build band
az webapp config appsettings set -g $RG -n $API --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false \
  WEBSITE_RUN_FROM_PACKAGE=0

# har start par migrations chalein, phir server
az webapp config set -g $RG -n $API \
  --startup-file "npx prisma migrate deploy && node dist/server.js"
```

### 2c. Static Web App (frontend)

```bash
az staticwebapp create -g $RG -n eg-digital-web -l eastasia --sku Free
az staticwebapp secrets list -g $RG -n eg-digital-web --query "properties.apiKey" -o tsv
```
Ye API key aage GitHub secret mein jayegi.

---

## 3. Backend environment variables (App Service)

```bash
az webapp config appsettings set -g $RG -n $API --settings \
  NODE_ENV=production \
  DATABASE_URL="postgresql://egadmin:<PASSWORD>@$PG.postgres.database.azure.com:5432/egdigital?sslmode=require" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  JWT_ACCESS_EXPIRES=15m \
  JWT_REFRESH_EXPIRES=7d \
  CORS_ORIGIN="https://<swa-hostname>.azurestaticapps.net" \
  APP_URL="https://<swa-hostname>.azurestaticapps.net" \
  PAYMENT_PUBLIC_BASE_URL="https://<swa-hostname>.azurestaticapps.net" \
  SUPER_ADMIN_EMAIL="admin@egdigital.com.au" \
  SUPER_ADMIN_PASSWORD="<StrongAdminPassword>" \
  STORAGE_DRIVER=local \
  DEFAULT_CURRENCY=AUD DEFAULT_LOCALE=en-AU \
  GEOCODING_ENABLED=true
```

Notes:
- `PORT` set **mat** karein — App Service khud inject karta hai.
- Blob storage use karna ho: `STORAGE_DRIVER=azure` + `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_STORAGE_CONTAINER`.
- App Service ka local disk ephemeral hai — production mein uploads ke liye Blob recommended hai.

---

## 4. GitHub secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|--------|-------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | `az webapp deployment list-publishing-profiles -g $RG -n $API --xml` ka pura XML |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | step 2c wali API key |
| `VITE_API_URL` | `https://<api>.azurewebsites.net/api` |

```bash
az webapp deployment list-publishing-profiles -g $RG -n $API --xml
```

`.github/workflows/backend.yml` mein `AZURE_WEBAPP_NAME` ko apne App Service ke naam se badal dein.

---

## 5. Database migrate + seed (pehli baar)

Startup command har deploy par `prisma migrate deploy` chala deta hai, lekin **seed** manually ek baar chalana hoga:

```bash
cd backend
# local terminal se, Azure DB ki taraf point karke
export DATABASE_URL="postgresql://egadmin:<PASSWORD>@eg-digital-pg.postgres.database.azure.com:5432/egdigital?sslmode=require"
npx prisma migrate deploy
npm run seed
```

Windows PowerShell mein:
```powershell
$env:DATABASE_URL="postgresql://egadmin:<PASSWORD>@eg-digital-pg.postgres.database.azure.com:5432/egdigital?sslmode=require"
npx prisma migrate deploy
npm run seed
```

---

## 6. Deploy

```bash
git push origin main
```
Dono workflows chalenge. GitHub → Actions tab par status dekhein.

Verify:
```bash
curl https://<api>.azurewebsites.net/api/health
# {"success":true,"message":"ok","data":{"up":true}}
```
Phir SWA URL kholein aur `/login` par super-admin credentials se login karein.

---

## 7. Custom domain (optional)

```bash
az staticwebapp hostname set -g $RG -n eg-digital-web --hostname app.egdigital.com.au
az webapp config hostname add -g $RG --webapp-name $API --hostname api.egdigital.com.au
```
Domain badalne ke baad `CORS_ORIGIN`, `APP_URL`, `PAYMENT_PUBLIC_BASE_URL` aur `VITE_API_URL` update karke re-deploy karein.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Frontend se API call CORS error | `CORS_ORIGIN` mein exact SWA origin ho (trailing `/` nahi), comma-separated multiple allowed |
| `Invalid environment variables` log | App Service settings mein `DATABASE_URL`/`JWT_SECRET` missing ya chhote hain (min 8 chars) |
| `P1001 Can't reach database` | Firewall rule `AllowAzureServices` (0.0.0.0) missing, ya `sslmode=require` nahi laga |
| App Service 503 | Log stream dekhein: `az webapp log tail -g $RG -n $API` |
| SPA refresh par 404 | `frontend/public/staticwebapp.config.json` dist mein aana chahiye |
| Prisma engine error | Build ubuntu runner par hua ho (workflow aisa hi hai) — local Windows `node_modules` deploy na karein |
