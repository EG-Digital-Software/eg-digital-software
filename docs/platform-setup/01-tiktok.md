# TikTok — Setup steps

**Portal mein kya milega**
- **Social Media Dashboard:** followers, videos list, har video ke views / likes / comments / shares, monthly TikTok figures (views, likes, comments, shares, posts, engagement rate).
- **Content Calendar:** approved post TikTok pe publish (video ya photo), har post ki TikTok settings (privacy, Comment/Duet/Stitch, commercial content disclosure, consent).

## URLs (form mein bharne ke liye)

| TikTok form ka field | URL |
|---|---|
| Terms of Service URL | `https://teamegdigital.com/terms` |
| Privacy Policy URL | `https://teamegdigital.com/privacy` |
| Website URL | `https://teamegdigital.com` |
| Data deletion (agar poocha jaaye) | `https://teamegdigital.com/data-deletion` |
| Redirect URI (Login Kit) | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/tiktok/callback` |

## Step 1 — Developer account + organization
1. https://developers.tiktok.com → company ke TikTok account se **Log in**.
2. Profile menu → **Organizations → Create organization** → naam **EG Eloma**.
3. App isi organization ke andar banana (company ke naam pe rahe).

## Step 2 — App banao
1. **Manage apps → Connect an app** → organization **EG Eloma**.
2. **Basic information**:

| Field | Value |
|---|---|
| App icon | 1024×1024 EG Eloma logo |
| App name | EG Eloma Dashboard |
| Category | Business / Productivity |
| Description | Agency tool to schedule and publish client-approved content to TikTok and show account statistics in client reports. |
| Terms of Service URL | `https://teamegdigital.com/terms` |
| Privacy Policy URL | `https://teamegdigital.com/privacy` |
| Platforms | **Web** |
| Web/Desktop URL | `https://teamegdigital.com` |

3. **Website verify:** Domain option → `teamegdigital.com` → TikTok ek **TXT record** dega (`tiktok-developers-site-verification=...`) → jahan DNS manage hota hai wahan TXT record add (Host `@`) → 5–30 min baad **Verify**.

## Step 3 — Products add karo
1. **Login Kit** → Redirect URI (upar wali table se, bilkul exact).
2. **Content Posting API** → **Direct Post ON**.
3. **Display API**.

## Step 4 — Scopes (5)

| Scope | Use (English mein likhna) |
|---|---|
| `user.info.basic` | Show the connected account's name and avatar |
| `user.info.profile` | Show the username and profile link |
| `user.info.stats` | Show follower, likes and video counts in client reports |
| `video.list` | Show each video's views, likes, comments and shares in client reports |
| `video.publish` | Publish client-approved posts from the Content Calendar |

`video.upload` **nahi** lena.

## Step 5 — Photo posts ke liye URL prefix verify (optional)
- Video ke liye zaroori nahi (server khud upload karta hai). Photo ke liye TikTok file khud download karta hai.
- TikTok app → **URL properties → Add → URL prefix** → `https://<storage-naam>.blob.core.windows.net/eg-digital/` → TikTok ki verification file Azure storage ke **eg-digital** container ke root mein upload → **Verify**.
- Photos sirf **JPG / WebP** (PNG nahi).

## Step 6 — Azure mein keys
Azure Portal → **App Services → eg-digital-api → Settings → Environment variables → App settings → + Add**:

| Name | Value |
|---|---|
| `TIKTOK_CLIENT_KEY` | TikTok Client Key |
| `TIKTOK_CLIENT_SECRET` | TikTok Client Secret |
| `TIKTOK_REDIRECT_URI` | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/tiktok/callback` |

**Apply → Confirm**.

## Step 7 — Sandbox test (sirf demo client)
1. TikTok app → **Sandbox → Create sandbox** → **Target users** mein test TikTok account add.
2. Portal → demo client ka task → Content Calendar → Accounts → **Connect TikTok** → Dashboard pe figures → test post.
3. Audit se pehle API se har post **private (Only me)** jaata hai — TikTok ka rule.

## Step 8 — App Review / Audit
- Demo video (screen recording): Connect → TikTok login → Dashboard figures → Content Calendar post → TikTok settings card → Publish → TikTok profile pe post.
- Har scope ka use (Step 4 table). Approval: kuch din se ~2 hafte.

## Step 9 — Approval ke baad
- Posts public ja sakte hain. Client apne Connected accounts mein **Connect TikTok** dabake khud login karega.

## Rules yaad rakho
- Video: MP4 / MOV / WebM, 4 GB tak. Caption: video 2200, photo 4000 characters.
- First comment TikTok API se nahi hota.
- Har post pe privacy + consent zaroori.
- Watch time, traffic source, profile views API se nahi milte — "Update data" se bharna.
- TikTok APIs free hain.
