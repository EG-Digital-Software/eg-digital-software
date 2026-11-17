# Meta — Facebook, Instagram aur Meta Ads — Setup steps

Code pehle se live hai (ek hi Meta connection teeno ke liye). Ye steps Meta developer app + review ke liye hain.

**Portal mein kya milega**
- **Social Media Dashboard:** Facebook Page aur Instagram (reach, views, interactions, follows, link clicks, posts / Reels table, monthly figures), **Meta Ads** (spend, impressions, reach, results, leads, ROAS, campaigns + ads tables, placements, audience).
- **Content Calendar:** Facebook Page post + Instagram feed post / Reel, first comment ke saath.

## URLs (Meta form mein bharne ke liye)

| Meta field | URL |
|---|---|
| Privacy Policy URL | `https://teamegdigital.com/privacy` |
| Terms of Service URL | `https://teamegdigital.com/terms` |
| User data deletion → Data deletion instructions URL | `https://teamegdigital.com/data-deletion` |
| App domains | `teamegdigital.com` |
| Site URL (Website platform) | `https://teamegdigital.com` |
| Valid OAuth Redirect URIs | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/meta/callback` |

## Step 1 — Business portfolio + app
1. https://business.facebook.com → EG Eloma ka **Business portfolio** (nahi hai to banao) → **Business info → Start verification** (business documents — ABN etc.). Advanced access ke liye business verification zaroori hai.
2. https://developers.facebook.com → **My Apps → Create app** → use case **"Other" → app type Business** → naam **EG Eloma Dashboard** → business portfolio EG Eloma chuno.

## Step 2 — Basic settings
**App settings → Basic**:
- App icon, category (Business and pages), contact email `connect@egeloma.com.au`.
- Upar table ke Privacy / Terms / Data deletion URLs, App domains.
- **+ Add platform → Website** → `https://teamegdigital.com`.
- **App ID** aur **App secret** yahin milte hain.

## Step 3 — Products
1. **Facebook Login for Business** → Settings → **Valid OAuth Redirect URIs:** `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/meta/callback` → Client OAuth login ON, Web OAuth login ON, Enforce HTTPS ON.
2. (Optional, recommended) **Configurations → Create configuration** → token type *User access token* → assets: Pages, Instagram accounts, Ad accounts → permissions (neeche list) → **Configuration ID** copy → `META_CONFIG_ID`.
3. **Instagram** product (Instagram API with Facebook Login) aur **Marketing API** add karo.

## Step 4 — Permissions (App Review → Permissions and features)

| Permission | Kis kaam ka |
|---|---|
| `pages_show_list` | Client ke Pages ki list |
| `pages_read_engagement` | Page posts aur engagement |
| `read_insights` | Page insights (reach, views, follows) |
| `instagram_basic` | Instagram account aur media |
| `instagram_manage_insights` | Instagram insights |
| `ads_read` | Meta Ads figures (read only) |
| `business_management` | Business portfolio ke assets dhundhna |
| `pages_manage_posts` | Content Calendar se Page pe post |
| `pages_manage_engagement` | First comment |
| `instagram_content_publish` | Content Calendar se Instagram post / Reel |
| `instagram_manage_comments` | Instagram first comment |

Har ek ke liye **Advanced access** request: use case text + screencast (demo client pe: Connect Meta → Page / IG / ad account choose → dashboard figures → Content Calendar post → Page/IG pe post dikhna).

## Step 5 — Azure mein keys
Azure Portal → **App Services → eg-digital-api → Settings → Environment variables → App settings**:

| Name | Value |
|---|---|
| `META_APP_ID` | App ID |
| `META_APP_SECRET` | App secret |
| `META_REDIRECT_URI` | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/meta/callback` |
| `META_CONFIG_ID` (optional) | Facebook Login for Business configuration ID |

(Agar ye pehle se set hain to kuch nahi karna.)

## Step 6 — Test (sirf demo client)
1. App **Development mode** mein sirf app roles (Admin / Developer / Tester) wale log login kar sakte hain — test Facebook account ko **App roles → Roles** mein add karo.
2. Demo client task → Dashboard → Connected accounts → **Connect with Facebook** → Page, Instagram aur **Meta ad account** chuno.
3. Dashboard → Facebook / Instagram / Meta Ads channels; Content Calendar → test post.

## Step 7 — Live
- App Review approve + business verification ke baad app ko **Live** mode mein switch karo.
- Real clients khud **Connect Meta** karke apna Page / Instagram / ad account allow karenge.

## Rules yaad rakho
- Instagram: professional (Business / Creator) account, Facebook Page se linked. Image JPEG only, 4:5 se 1.91:1, 8 MB tak; caption 2200, max 30 hashtags.
- Meta token ~60 din chalta hai; card pe "access renews by …" date dikhti hai — expire hone pe **Reconnect Meta**.
- Meta APIs free hain.
