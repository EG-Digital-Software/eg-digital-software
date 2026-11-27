# Search Console, Google Analytics, Business Profile: Setup steps

Admin → **Marketing** ke **SEO** aur **Local Listing** views ab har figure live padhte hain. Koi manual entry nahi hai.

**Portal mein kya milega**

| Source | Kahan dikhega | Figures |
|---|---|---|
| **Google Search Console** | SEO | Clicks, impressions, CTR, average position (din ke hisaab se, 16 mahine tak), 5 countries (AU, NZ, UK, US, CA), har country ki top 50 searches with position, page aur change |
| **Google Analytics 4** | SEO | Organic search se aaye leads (key events) |
| **Google Business Profile** | Local Listing aur SEO ka "Local search" | Profile views, calls, direction requests, website clicks, Google reviews, rating, reply rate, naye reviews |
| **PageSpeed Insights** | SEO | Mobile performance score, LCP, INP, CLS. Koi sign-in nahi chahiye, home page apne aap test hota hai |
| **Portal Tasks** | SEO / Local "Work completed" | Company ke apne customer record (naam exact match, jaise "EG Eloma") par complete hue tasks |

Yeh hata diye gaye kyunki inki koi free API nahi hai: **Backlinks**, **directory listings check**, **Google Maps ranking**, aur **Threads** (Threads abhi connect nahi hota).

> Yeh teeno **wahi Google Cloud project aur wahi OAuth client** use karte hain jo YouTube / Google Ads ke liye bana hai (`03-youtube.md`). Agar woh pehle se set hai, to sirf neeche ke Steps 1, 2, 3 (aur Business Profile ke liye Step 4) karne hain. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` aur `GOOGLE_REDIRECT_URI` pehle se Azure mein hain to unhe dobara nahi daalna.

---

## Step 1: APIs enable karo

1. https://console.cloud.google.com kholo → upar project dropdown se **EG Eloma Dashboard** chuno.
2. **APIs & Services → Library** mein ek-ek karke search karo aur **Enable** dabao:

| API | Kis liye |
|---|---|
| **Google Search Console API** | SEO: clicks, impressions, searches |
| **Google Analytics Data API** | SEO: organic leads |
| **Google Analytics Admin API** | Connect karte waqt GA4 properties ki list |
| **My Business Account Management API** | Business Profile accounts ki list |
| **My Business Business Information API** | Business Profile locations ki list |
| **Business Profile Performance API** | Views, calls, directions, website clicks |
| **Google My Business API** | Reviews (yeh Step 4 ke approval ke baad hi dikhta hai) |
| **PageSpeed Insights API** | Page speed (optional, Step 5 dekho) |

## Step 2: Consent screen mein scopes jodo

1. **APIs & Services → OAuth consent screen** kholo (naye UI mein **Google Auth Platform → Data access**).
2. **Add or remove scopes** dabao aur yeh teen tick karo (list mein na dikhe to "Manually add scopes" box mein paste karo):

| Scope | Kis kaam ka | Google category |
|---|---|---|
| `https://www.googleapis.com/auth/webmasters.readonly` | Search Console padhna | Sensitive |
| `https://www.googleapis.com/auth/analytics.readonly` | Google Analytics padhna | Sensitive |
| `https://www.googleapis.com/auth/business.manage` | Business Profile padhna | Sensitive |

3. **Update → Save** dabao.
4. App abhi **Testing** mode mein hai to **Audience → Test users** mein woh Google accounts add karo jinse aap connect karoge (jo Search Console, GA4 aur Business Profile ke owner ya manager hain).

> Testing mode mein Google refresh token 7 din mein expire kar deta hai, phir report mein "access has expired, connect it again" aayega. Hamesha chalne ke liye app ko **Publish app** (In production) karna hoga, aur sensitive scopes ke liye Google ka verification lagega (privacy policy aur demo video ke saath, jaise YouTube ke liye kiya tha).

## Step 3: Redirect URI (sirf check karna)

**APIs & Services → Credentials → OAuth 2.0 Client IDs → EG Eloma Dashboard** kholo. **Authorized redirect URIs** mein yeh hona chahiye (YouTube wala hi hai):

`https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/google/callback`

## Step 4: Business Profile API access (Google approval)

Business Profile ki APIs tabhi chalti hain jab Google project ko access de. Bina approval ke inki quota **0** rehti hai.

1. Pehle Google Cloud mein project ka **Project number** copy karo (Dashboard → Project info).
2. Form kholo: https://developers.google.com/my-business/content/prereqs → **"Request access to the API"** wala link (GBP API contact form).
3. Form mein yeh bharo:
   - **Request type:** *Application for Basic API Access*
   - Company: Eloma Group / EG Eloma, website `https://egeloma.com.au`
   - Project number: Step 4.1 wala
   - Use case: *"Internal reporting dashboard for our own business locations: read performance metrics and reviews. No posting or editing."*
   - Contact email: woh email jo Business Profile ka **owner/manager** hai
4. Approval email aane mein kuch din se kuch hafte lagte hain. Approve hone par **APIs & Services → Quotas** mein Business Profile APIs ki quota 0 se upar dikhegi.
5. Approval ke baad **Google My Business API** bhi Library mein enable kar do (reviews ke liye).

> Approval aane tak: Business Profile connect karoge to message aayega *"Google has not approved Business Profile API access for this app yet"*. Search Console aur Analytics is approval par depend nahi karte, woh turant chalenge.

## Step 5 (optional): PageSpeed API key

Bina key ke bhi PageSpeed chalta hai, bas Google ki daily limit kam hoti hai. Kabhi "quota" error dikhe to:

1. **APIs & Services → Credentials → + Create credentials → API key**.
2. Key par click → **API restrictions → Restrict key → PageSpeed Insights API** chuno → Save. Iske liye billing nahi chahiye.
3. Azure → **App Services → eg-digital-api → Environment variables** mein add karo: `PAGESPEED_API_KEY` = woh key → **Apply → Confirm**.

## Step 6: Portal mein connect karo

1. Admin portal → **Marketing** → **Connected accounts** button dabao.
2. Neeche **Connected logins** mein:
   - **Search Console → Connect**: us Google account se sign in karo jise Search Console mein site dikhti hai.
   - **Google Analytics → Connect**: GA4 property wala account.
   - **Business Profile → Connect**: profile ka owner/manager account.
3. Upar **Pages for each company** mein company chuno (jaise *EG Eloma*), phir:
   - **Search Console → Website** mein site chuno (jaise `egeloma.com.au`) → **Save for EG Eloma**
   - **Google Analytics → Analytics property** chuno → Save
   - **Business Profile → Location** chuno → Save
4. Har company (Bivry waghera) ke liye Step 3 dohrao, agar unki apni site / property / location hai.
5. SEO aur Local Listing views apne aap figures padh lenge. Figures 30 minute tak cache rehte hain. Turant naya data chahiye to **Refresh** dabao.

## Step 7 (optional): Work completed mein portal tasks

"Work completed" mein Team actions ke ticks ke saath portal ke completed tasks bhi aate hain. Iske liye portal mein ek customer record chahiye jiska **Company name** ya **Trading as** bilkul company ke naam jaisa ho:

| Company | Customer record ka naam |
|---|---|
| EG Eloma | `EG Eloma` |
| Bivry | `Bivry` |
| EG Imports | `EG Imports` |
| EG Travels | `EG Travels` |
| ELOMA Customer Care | `ELOMA Customer Care` |

Us customer ke tasks complete hone par report mein dikhte hain. Jinke title ya list mein *local, listing, review, Business Profile, Google Maps* ho, woh Local view mein jaate hain, baaki SEO view mein.

---

## Problem aaye to

| Message | Matlab / kya karna hai |
|---|---|
| **Search Console not connected** | Step 6 karo. Connect hone ke baad company ke liye Website choose karna zaroori hai. |
| **Connected, but this Google login has no verified Search Console property** | Galat Google account se sign in hua. Search Console mein jo account owner/user hai usse dobara Connect karo. |
| **Search Console refused access: … API has not been used / disabled** | Step 1 mein Search Console API enable nahi hai. |
| **… access has expired. Connect it again.** | Testing mode ka 7 din wala expiry (Step 2 ka note) ya password change. Connected accounts mein dobara Connect karo. |
| **Google has not approved Business Profile API access** | Step 4 ka approval abhi pending hai. |
| **PageSpeed Insights could not test … quota** | Step 5 ki API key daalo. |
| Leads hamesha 0 | GA4 mein koi **key event** (jaise form submit) mark nahi hai. GA4 → Admin → Events → event ko *Mark as key event* karo. |
