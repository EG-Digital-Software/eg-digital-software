# Social platform setup — EG Eloma Dashboard

Ye folder har platform ka developer-app setup step-by-step batata hai. Code portal mein ready hai — har platform ke liye bas app banana hai, keys **Azure App Service → eg-digital-api → Settings → Environment variables → App settings** mein daalni hain, aur platform ka review/approval lena hai.

| File | Platform | Social Media Dashboard | Content Calendar |
|---|---|---|---|
| [01-tiktok.md](01-tiktok.md) | TikTok | Followers, videos, views, likes, comments, shares | Video + photo posts |
| [02-linkedin.md](02-linkedin.md) | LinkedIn Company Page | Impressions, clicks, reactions, comments, reposts, followers, Page views, posts | Text / image / video posts |
| [03-youtube.md](03-youtube.md) | YouTube | Views, watch time, subscribers, traffic sources, Shorts vs videos, videos | Video upload |
| [04-google-ads.md](04-google-ads.md) | Google Ads | Spend, clicks, conversions, ROAS, campaigns, impression share, devices | — (ads ko post nahi kiya jaata) |
| [05-meta-facebook-instagram-ads.md](05-meta-facebook-instagram-ads.md) | Facebook, Instagram, Meta Ads | Sab figures + Meta Ads campaigns | Facebook + Instagram posts |

> **Admin → Cloud tab (Azure live figures):** setup [06-azure-cloud-tab.md](06-azure-cloud-tab.md) mein hai. Yeh social platform nahi, ek read-only Azure app registration hai.

> **Google Ads aur Meta Ads Content Calendar mein kyun nahi?** Content Calendar organic posts publish karta hai. Ads ka creative Ads Manager / Google Ads mein banta hai — dono ad platforms Dashboard mein (figures) aate hain, aur unke "Connected accounts" Content Calendar ke Accounts view mein bhi same connection use karte hain.

## Saare platforms ke common URLs

| Field (developer app form) | URL |
|---|---|
| Terms of Service URL | `https://teamegdigital.com/terms` |
| Privacy Policy URL | `https://teamegdigital.com/privacy` |
| Data Deletion URL / instructions | `https://teamegdigital.com/data-deletion` |
| Website / App domain | `https://teamegdigital.com` |
| App icon | EG Eloma logo, 1024×1024 (PNG) |
| Contact email | `connect@egeloma.com` |

## Redirect / Callback URIs (har app mein bilkul exact copy karna)

| Platform | Redirect URI |
|---|---|
| Meta (Facebook / Instagram / Meta Ads) | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/meta/callback` |
| TikTok | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/tiktok/callback` |
| LinkedIn | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/linkedin/callback` |
| Google (YouTube **aur** Google Ads — ek hi) | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback` |

## Azure environment variables (summary)

| Platform | Variables |
|---|---|
| Meta | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (optional: `META_CONFIG_ID`) |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` (optional: `LINKEDIN_API_VERSION`, default `202606`) |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Google Ads | upar wale 3 Google variables + `GOOGLE_ADS_DEVELOPER_TOKEN` (optional: `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_API_VERSION`, default `v24`) |
| Sab ke liye | `CREDENTIAL_ENC_KEY` pehle se set hona chahiye (tokens encrypted store hote hain) |

**Secrets (Client Secret, App Secret, Developer token) kabhi chat/email/WhatsApp mein paste mat karna — seedha Azure mein daalo.** Azure mein **Apply → Confirm** ke baad app 1–2 minute mein restart hota hai aur us platform ka "Connect" button chalu ho jaata hai.

## Testing rule

Har platform pehle **sirf demo client** pe test hoga (Connect → Sync → test post). Real clients ("3 two 1", "The Himalayan") ko approval ke baad hi connect karwana hai.

## Deploy note (team ke liye)

LinkedIn/YouTube/Google Ads code ke saath ek naya DB migration hai: `20261126120000_content_post_youtube` — `ContentPost` table mein ek nullable `youtube` JSONB column (sirf add, koi data delete/change nahi). Push karte hi prod pe auto-apply hota hai, isliye push se pehle owner ki permission.
