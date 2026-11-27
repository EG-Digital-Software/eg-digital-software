# Admin → Cloud tab: Azure se live figures

Admin portal ka **Cloud** tab ab har figure seedha Azure se padhta hai: spend, budget, usage, availability, incidents, Advisor recommendations, Secure Score, alerts, vulnerabilities, patching, backups, team ke changes aur MFA. Koi manual entry nahi hai.

Code ready hai. Bas ek **read-only app registration** banana hai, use subscription par roles dene hain, aur 4 settings API app mein daalni hain. Kul 20–30 minute ka kaam hai.

> Is app ko sirf **read** roles milte hain. Portal Azure mein kuch bhi change ya delete nahi karta.

---

## Pehle se kya chahiye

- Azure portal (`https://portal.azure.com`) par aisa account jo:
  - **Entra ID** mein app registration bana sake (Application Administrator ya Global Administrator), aur
  - subscription par roles de sake (subscription ka **Owner** ya **User Access Administrator**).
- Woh subscription(s) jinme clients ke resources hain.

---

## Step 1: App registration banao

1. `https://portal.azure.com` kholo.
2. Upar search bar mein **Microsoft Entra ID** likho aur kholo.
3. Left menu mein **Manage → App registrations** par jao.
4. Upar **+ New registration** dabao.
5. Form bharo:
   - **Name:** `eg-cloud-reader`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)*
   - **Redirect URI:** khaali chhod do
6. **Register** dabao.
7. App ka **Overview** page khulega. Yahan se do values copy karke kahin safe jagah (notepad) rakh lo:
   - **Application (client) ID** → yeh `AZURE_MONITOR_CLIENT_ID` hai
   - **Directory (tenant) ID** → yeh `AZURE_MONITOR_TENANT_ID` hai

## Step 2: Client secret banao

1. Usi app (`eg-cloud-reader`) mein left menu se **Manage → Certificates & secrets** kholo.
2. **Client secrets** tab mein **+ New client secret** dabao.
3. **Description:** `EG portal Cloud tab`, **Expires:** 24 months (ya jo policy ho).
4. **Add** dabao.
5. Jo row bani usme **Value** column copy karo (Secret ID nahi). Yeh `AZURE_MONITOR_CLIENT_SECRET` hai.

> ⚠️ Value sirf abhi dikhti hai. Page chhodne ke baad dobara nahi dikhegi, phir naya secret banana padega.
>
> 📅 Expiry date calendar mein note kar lo. Secret expire hone par Cloud tab "Sign-in to Azure failed" dikhayega. Tab naya secret banake setting update karni hogi.

## Step 3: Subscription ID nikaalo

1. Search bar mein **Subscriptions** likho aur kholo.
2. List mein har us subscription ka **Subscription ID** copy karo jisme clients ke resources hain.
3. Ek se zyada hon to comma se jodo, jaise `aaaa-...-1111,bbbb-...-2222`. Yeh `AZURE_MONITOR_SUBSCRIPTION_IDS` hai.

## Step 4: Subscription par roles do

Yeh step **har subscription** ke liye karna hai.

1. **Subscriptions** → apni subscription kholo.
2. Left menu mein **Access control (IAM)** kholo.
3. **+ Add → Add role assignment** dabao.
4. **Role** tab mein search karke **Reader** chuno → **Next**.
5. **Members** tab mein:
   - **Assign access to:** *User, group, or service principal*
   - **+ Select members** → `eg-cloud-reader` search karke select karo → **Select**
6. **Review + assign** dabao (do baar).
7. Yahi steps 3–6 inke liye bhi dohrao:

| Role | Kis liye |
|---|---|
| **Reader** | Resource groups, resources, usage metrics, Advisor, Resource Health, Activity Log, patching |
| **Cost Management Reader** | Monthly spend, cost by service, cost per resource, budgets |
| **Security Reader** | Secure Score, security alerts, vulnerabilities, security recommendations |
| **Backup Reader** | Backup jobs (sirf agar Recovery Services vault use hote hain) |

> Role assign hone ke baad Azure ko apply karne mein 5–10 minute lag sakte hain.

## Step 5 (optional): MFA coverage ke liye Graph permission

Isse "Users with MFA %" dikhta hai. Iske liye tenant mein **Entra ID P1 ya P2** license chahiye. Yeh step na karo to baaki sab chalega, bas MFA wali jagah "No access" dikhega.

1. **Microsoft Entra ID → App registrations → eg-cloud-reader** kholo.
2. **Manage → API permissions** kholo.
3. **+ Add a permission → Microsoft Graph → Application permissions** chuno.
4. Search mein `AuditLog.Read.All` likho, tick karo → **Add permissions**.
5. Wapas list mein **Grant admin consent for <tenant>** dabao → **Yes**.
6. Status column mein green tick ("Granted") aana chahiye.

## Step 6: Settings API app mein daalo

1. Search bar mein **App Services** kholo → **eg-digital-api**.
2. Left menu mein **Settings → Environment variables** kholo.
3. **App settings** tab mein har setting ke liye **+ Add** dabao:

| Name | Value |
|---|---|
| `AZURE_MONITOR_TENANT_ID` | Step 1 ka Directory (tenant) ID |
| `AZURE_MONITOR_CLIENT_ID` | Step 1 ka Application (client) ID |
| `AZURE_MONITOR_CLIENT_SECRET` | Step 2 ka secret **Value** |
| `AZURE_MONITOR_SUBSCRIPTION_IDS` | Step 3 ki subscription ID(s), comma se alag |
| `AZURE_MONITOR_CLIENT_TAG` | *(optional)* default `client` hai; tabhi daalo jab tag ka naam alag rakhna ho |

4. Neeche **Apply** dabao, phir upar **Confirm**. App apne aap restart hoga.

> Naya code deploy hona zaroori hai (Cloud tab wala change `main` par push hone ke baad). Is change mein koi DB migration nahi hai.

## Step 7 (optional, recommended): Resource groups par client tag

Default mein **har resource group ek client** maana jaata hai. Agar ek client ke kai resource groups hain (jaise `rg-harbour-prod` aur `rg-harbour-dev`), to un sab par ek jaisa tag lagao:

1. **Resource groups** → group kholo → left menu **Tags**.
2. **Name:** `client`, **Value:** client ka naam (jaise `Harbour Cafe`).
3. **Apply** dabao.
4. Us client ke baaki groups par bhi bilkul yahi value daalo.

Jin groups par tag nahi hai, unka naam hi client ka naam hoga. `NetworkWatcherRG`, `DefaultResourceGroup-*`, `MC_*` (AKS) jaise system groups kisi client mein nahi gine jaate. Unka kharcha **"Shared or unassigned cost"** mein dikhta hai.

## Step 8: Portal mein check karo

1. Admin portal → **Cloud** tab kholo.
2. Pehli baar padhne mein ek minute tak lag sakta hai ("Reading the latest figures from Azure").
3. Upar **Clients on this subscription** mein resource groups ki list dikhni chahiye. Kisi client par click karke uski full report dekho.
4. Upar peela banner aaye ("Some figures could not be read from Azure"), to usme likha hoga kaunsa role ya permission missing hai. Neeche table dekho.
5. Figures 15 minute tak cache rehte hain. Turant naya data chahiye to **Refresh from Azure** dabao.

---

## Har figure ke liye Azure mein kya on hona chahiye

| Cloud tab mein | Kahan se aata hai | Agar khaali dikhe |
|---|---|---|
| Spend, cost by service, cost per resource | Cost Management | Cost Management Reader role check karo. Naye resources ka cost 24–48 ghante baad aata hai. |
| Budget | Cost Management → Budgets | Subscription ya resource group par **monthly budget** banao (Cost Management → Budgets → + Add). |
| CPU, memory, disk | Azure Monitor metrics | VMs, App Service plans, SQL/PostgreSQL/MySQL, Redis, AKS ke liye apne aap aata hai. VM memory ke liye VM par Azure Monitor Agent / VM insights on hona chahiye. |
| Availability, response time | App Insights availability tests, App Service requests, VM availability metric | Website ke liye Application Insights mein **Availability test** banao. |
| Incidents | Resource Health (Activity Log) | Kuch karna nahi; downtime hone par apne aap aata hai. Team ka khud stop kiya VM incident nahi gina jaata. |
| Recommendations, savings | Azure Advisor | Kuch karna nahi; Advisor roz apne aap check karta hai. |
| Secure Score, security recommendations | Defender for Cloud | Subscription par Defender for Cloud on hona chahiye (free "Foundational CSPM" bhi chalega). |
| High/Medium alerts | Defender for Cloud alerts | Defender plans (jaise Defender for Servers) on hone chahiye. |
| Critical vulnerabilities | Defender vulnerability assessment | Defender for Servers ke saath vulnerability scanner on karo. |
| Patch compliance | Azure Update Manager | Update Manager → Settings → **Periodic assessment** on karo VMs ke liye. |
| Backups | Recovery Services vault backup jobs | Backup Reader role, aur VMs par Azure Backup configured hona chahiye. |
| Work completed | Activity Log | Kuch karna nahi; team members (email wale accounts) ke changes apne aap aate hain. 90 din tak. |
| Users with MFA | Microsoft Graph | Step 5 (P1/P2 license chahiye). |

---

## Problem aaye to

| Message | Matlab / kya karna hai |
|---|---|
| **Connect the Azure subscription** + settings ke naam | Step 6 ki koi setting missing hai. Naam bilkul exact copy karo. |
| **Sign-in to Azure failed: … invalid client secret** | Secret galat hai ya expire ho gaya. Step 2 se naya secret banao aur `AZURE_MONITOR_CLIENT_SECRET` update karo. |
| **Sign-in to Azure failed: … tenant** | `AZURE_MONITOR_TENANT_ID` galat hai. Directory (tenant) ID dobara copy karo. |
| **No access. Needs …** | Jo role likha hai woh Step 4 se us subscription par do. 10 minute baad **Refresh from Azure** dabao. |
| **No resource groups found** | Subscription ID galat hai, ya app ko Reader role nahi mila. |
| Koi client ka cost "–" | Us resource group mein is mahine abhi tak koi kharcha nahi hua, ya cost data abhi aaya nahi (24–48 ghante). |

## Secret renew karna (har 24 mahine)

1. **Entra ID → App registrations → eg-cloud-reader → Certificates & secrets → + New client secret.**
2. Nayi **Value** copy karo.
3. **App Services → eg-digital-api → Environment variables** mein `AZURE_MONITOR_CLIENT_SECRET` ki value badlo → **Apply → Confirm**.
4. Cloud tab check karo, phir purana secret delete kar do.
