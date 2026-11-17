# Google Ads — Setup steps

**Portal mein kya milega (Social Media Dashboard → Google Ads channel)**
- Cost, impressions, clicks, CTR, avg CPC, conversions, conversion rate, cost per conversion, conversion value, ROAS.
- Optimisation score, spend by campaign type (Search / Performance Max / Display / Video), devices (mobile / desktop / tablet).
- Search visibility: impression share, top of page, lost to budget, lost to rank.
- Conversions by type (calls, forms, purchases, directions), campaigns table, daily spend chart.
- Monthly budget aur quality score — team "Update data" se bharti hai.
- **Content Calendar:** Google Ads read-only hai, isse kuch publish nahi hota.

## URLs

| Field | URL |
|---|---|
| Website / home page | `https://teamegdigital.com` |
| Privacy policy | `https://teamegdigital.com/privacy` |
| Terms of service | `https://teamegdigital.com/terms` |
| Data deletion | `https://teamegdigital.com/data-deletion` |
| Authorized redirect URI (YouTube wala hi) | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback` |

## Step 1 — Google Cloud (YouTube wala project hi)
Agar `03-youtube.md` ke Steps 1–5 ho chuke hain to sirf:
1. **APIs & Services → Library → Google Ads API → Enable**.
2. **OAuth consent screen → Data access → Add scope:** `https://www.googleapis.com/auth/adwords` (Sensitive) — use: *"Read the client's Google Ads performance (spend, clicks, conversions, campaigns) for their reporting dashboard. Read only."*
3. Redirect URI aur Client ID/secret wahi rahenge — kuch naya nahi.

(Agar YouTube setup nahi hua to pehle `03-youtube.md` ke Step 1, 3, 4, 5 follow karo.)

## Step 2 — Manager (MCC) account + Developer token
1. Agar EG Eloma ka **Google Ads Manager account (MCC)** nahi hai: https://ads.google.com/home/tools/manager-accounts → create (free).
2. Manager account mein login → **Admin (tools) → API Center** (https://ads.google.com/aw/apicenter).
3. Form bharo (company naam, website `https://teamegdigital.com`, contact email, API use: *reporting*) → **Developer token** milega.
4. Shuru mein token **Test access** pe hota hai — sirf **test ad accounts** ke saath chalta hai. Real client accounts ke liye **Basic access** apply karo (API Center → "Apply for Basic Access"): company details + tool ka design doc / screenshots (dashboard). Approval ~1–2 hafte (kabhi kuch din). Basic access mein 15,000 operations/day — humare liye kaafi.

## Step 3 — Client accounts ko MCC se link karo (recommended)
- MCC → **Accounts → + → Link existing account** → client ka 10-digit customer ID → client approve kare.
- Isse EG Eloma team ke Google login se bhi client ka account read ho jaata hai. Agar client khud apne Google login se connect karega to link zaroori nahi.

## Step 4 — Azure mein keys
Azure Portal → **App Services → eg-digital-api → Settings → Environment variables → App settings → + Add**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | (YouTube wala hi — agar already hai to dobara mat daalo) |
| `GOOGLE_CLIENT_SECRET` | (YouTube wala hi) |
| `GOOGLE_REDIRECT_URI` | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | API Center ka developer token |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional) | MCC ka ID, sirf digits (jaise `1234567890`). Zyada tar zaroorat nahi — portal khud pata laga leta hai ki account kis manager ke through mila. |
| `GOOGLE_ADS_API_VERSION` (optional) | Default `v24`. Google har version ~1 saal mein band karta hai — "version deprecated/sunset" error aaye to naya version (jaise `v25`) daalo. |

**Apply → Confirm**. Developer token set hone ke baad hi "Connect Google Ads" chalu hota hai.

## Step 5 — Test (sirf demo client)
1. Test ke liye: MCC ke andar ek **test manager account** + **test client account** bana sakte ho (test token inhi pe chalta hai).
2. Portal → demo client ka task → **Social Media Dashboard → Connected accounts → Google Ads → Connect with Google**.
3. Google login → permission allow → dropdown se **Google Ads account** chuno.
4. Dashboard → **Google Ads** channel → figures + campaigns table.

## Step 6 — Live
- Developer token **Basic access** approve hone ke baad real clients connect karein (client khud, ya EG Eloma team ka login jo MCC se linked hai).
- Google OAuth app verification (`03-youtube.md` Step 7.1) mein `adwords` scope bhi saath submit karna.

## Rules yaad rakho
- Read-only — portal Google Ads mein kuch change nahi karta.
- Google Ads API free hai (developer token limits ke andar).
- Figures account ki currency mein aate hain (dashboard `$` dikhata hai).
- Conversions "Primary" conversion actions se aate hain (Google Ads ka default reporting).
