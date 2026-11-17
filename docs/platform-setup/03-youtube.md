# YouTube — Setup steps

**Portal mein kya milega**
- **Social Media Dashboard (YouTube channel):** views, watch time (hours), subscribers gained / lost / net / total, average view duration, average % viewed, likes, comments, shares, traffic sources (search, browse, suggested, Shorts feed, external, channel), views by type (videos / Shorts / live), watch time from subscribers, videos published, videos table.
- **Content Calendar:** approved **video** YouTube pe upload — title, description (caption + hashtags), tags (hashtags se), privacy (Public / Unlisted / Private) aur "Made for kids" (YouTube ka zaroori sawaal).
- Jo API se nahi aata (impressions, CTR, unique viewers, revenue/RPM/CPM, end screen / card clicks) — "Update data" se.

## URLs (Google form mein bharne ke liye)

| Google Cloud field | URL |
|---|---|
| Application home page | `https://teamegdigital.com` |
| Application privacy policy link | `https://teamegdigital.com/privacy` |
| Application terms of service link | `https://teamegdigital.com/terms` |
| Authorized domain | `teamegdigital.com` (aur `azurewebsites.net` agar maange) |
| Data deletion (agar poocha jaaye) | `https://teamegdigital.com/data-deletion` |
| Authorized redirect URI | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback` |

> YouTube aur Google Ads **ek hi Google Cloud project + ek hi OAuth client** use karte hain. Pehle ye file follow karo, phir Google Ads ke liye `04-google-ads.md`.

## Step 1 — Google Cloud project
1. https://console.cloud.google.com → company Google account se login.
2. Upar project dropdown → **New project** → naam **EG Eloma Dashboard** → Create.

## Step 2 — APIs enable karo
**APIs & Services → Library** mein search karke **Enable**:
1. **YouTube Data API v3**
2. **YouTube Analytics API**
3. (Google Ads ke liye bhi chahiye to) **Google Ads API**

## Step 3 — OAuth consent screen (Google Auth Platform)
**APIs & Services → OAuth consent screen** (naye UI mein **Google Auth Platform → Branding / Audience / Data access**):
1. **User type:** **External**.
2. **Branding:** App name `EG Eloma Dashboard`, support email `connect@egeloma.com.au`, logo, home page / privacy / terms links (upar table), **Authorized domains:** `teamegdigital.com`.
3. **Data access → Add or remove scopes:**

| Scope | Kis kaam ka | Google category |
|---|---|---|
| `https://www.googleapis.com/auth/youtube.readonly` | Channel aur videos padhna | Sensitive |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | Channel analytics (views, watch time, subscribers) | Sensitive |
| `https://www.googleapis.com/auth/youtube.upload` | Content Calendar se video upload | Sensitive |

4. **Audience → Test users:** demo/test Google accounts add karo (testing mode mein sirf yahi login kar sakte hain, max 100).
5. Domain `teamegdigital.com` ko **Google Search Console** mein verify karna padega (DNS TXT record) — verification ke time Google maangta hai.

## Step 4 — OAuth Client ID
**APIs & Services → Credentials → + Create credentials → OAuth client ID**:
- Application type: **Web application**
- Name: `EG Eloma Dashboard`
- **Authorized redirect URIs:** `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback`
- Create → **Client ID** aur **Client secret** copy karo.

## Step 5 — Azure mein keys
Azure Portal → **App Services → eg-digital-api → Settings → Environment variables → App settings → + Add**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client secret |
| `GOOGLE_REDIRECT_URI` | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback` |

**Apply → Confirm**. (Ye teen YouTube aur Google Ads dono ke kaam aayenge.)

## Step 6 — Test (sirf demo client)
1. Portal → demo client ka task → **Content Calendar → Accounts → YouTube channel → Connect YouTube** (ya Dashboard → Connected accounts → **Connect with Google** under YouTube).
2. Google login screen pe **channel wala account / brand account** chuno, aur **saare permissions tick** karo (upload wala bhi).
3. Testing mode mein Google "Google hasn't verified this app" dikhayega → **Continue** (sirf test users ke liye).
4. Dashboard → YouTube channel pe figures (YouTube Analytics 2–3 din peeche chalta hai — ye normal hai).
5. Content Calendar → video wala test post → **YouTube** tick → YouTube settings (title, **Private**, Made for kids: No) → Publish.

## Step 7 — Google verification + YouTube audit (live ke liye)
Do alag approvals:
1. **OAuth app verification** (Google Auth Platform → **Verification Center → Submit / Publish app → In production**):
   - Sensitive scopes ka justification (Step 3 table ka use).
   - **Demo video (YouTube unlisted link):** consent screen pe app naam + scopes dikhe, browser address bar mein Client ID dikhe, phir har scope ka use portal mein dikhao (connect → dashboard figures → Content Calendar upload).
   - Privacy policy mein Google wali lines already hain (YouTube API Services, Google Privacy Policy, Limited Use).
   - Approval: ~1–4 hafte.
2. **YouTube API Services audit** (https://support.google.com/youtube/contact/yt_api_form):
   - Bina audit ke **API se upload hui har video PRIVATE lock** hoti hai (portal Publish ke baad warning dikhata hai).
   - Audit form: app ka kaam, kaun use karta hai, screenshots / demo. Iske baad public upload allow hota hai aur quota badhwa sakte ho.

## Quota
- YouTube Data API: default **10,000 units/day** per project. Ek video upload ≈ **1,600 units** (≈ 6 uploads/day). Figures padhna sasta hai.
- Zyada chahiye to audit ke saath quota increase request.

## Rules yaad rakho
- Sirf **video** (image nahi). Title max **100** characters, description max **5000**; `<` `>` allowed nahi.
- "Made for kids" har video pe batana zaroori.
- First comment API se nahi.
- Google refresh token deta hai — connection khud renew hota rehta hai. Agar client Google account se access hata de ya password badle to card "Expired" → **Reconnect YouTube**.
- Testing mode (unpublished app) mein Google refresh token **7 din** baad expire kar deta hai — production/verification ke baad ye limit hat jaati hai.
- YouTube APIs free hain (quota ke andar).
