# LinkedIn Company Page: setup steps (poori detail)

**Abhi ki sthiti:** code live hai. Content Calendar aur Social Media Dashboard mein LinkedIn card aa chuka hai. Ab bas LinkedIn app banani hai, keys Azure mein daalni hain, aur LinkedIn se approval lena hai.

---

## Portal mein LinkedIn se kya milega

**Social Media Dashboard (LinkedIn channel), apne aap:**
- Impressions, clicks, click-through rate, reactions, comments, reposts, engagement rate
- New followers (organic aur sponsored alag), total followers
- Page views (desktop aur mobile alag)
- Posts published, aur har post ki table (impressions, likes, comments, reposts)

**Jo LinkedIn ki API nahi deti, wo team "Update data" se bharegi:**
- Unique visitors
- Button clicks
- Leads
- Newsletter subscribers
- Competitors

**Content Calendar:** client ka approved post company Page pe publish hoga. Teen tarah ke post:
- Sirf text
- Ek image (JPG, PNG ya GIF)
- Ek video (MP4, 500 MB tak)

---

## URLs (LinkedIn form mein bharne ke liye)

| LinkedIn form ka field | URL |
|---|---|
| Privacy policy URL | `https://teamegdigital.com/privacy` |
| Terms of Service (agar maange) | `https://teamegdigital.com/terms` |
| Website | `https://teamegdigital.com` |
| Data deletion (agar maange) | `https://teamegdigital.com/data-deletion` |
| **Authorized redirect URL** | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/linkedin/callback` |

---

## Step 0: Pehle ye ready rakho

1. **EG Eloma ka LinkedIn Company Page.** LinkedIn app hamesha kisi company Page se judi hoti hai. Page nahi hai to banao: LinkedIn → **For Business → Create a Company Page**.
2. **Us Page ka Super admin.** App verify karne ke liye Super admin ka approval lagega.
3. **Company ka ek LinkedIn account,** jisse developer app banegi. Kisi ek employee ka personal account na ho to behtar hai.
4. Company ki details:
   - legal naam: EG Eloma ka registered naam
   - ABN
   - registered address
   - business email (`connect@egeloma.com.au`)

---

## Step 1: Developer app banao

1. https://www.linkedin.com/developers/apps kholo, phir **Create app** dabao.
2. Form bharo:

| Field | Kya bharna hai |
|---|---|
| App name | `EG Eloma Dashboard` |
| LinkedIn Page | EG Eloma ka company Page (search karke chuno) |
| Privacy policy URL | `https://teamegdigital.com/privacy` |
| App logo | EG Eloma logo (square PNG, kam se kam 100×100) |
| Legal agreement | Tick karo |

3. **Create app** dabao.

---

## Step 2: App ko company Page se verify karo

1. App kholo, **Settings** tab pe jao.
2. **App settings** mein Company ke saamne **Verify** dabao.
3. **Generate URL** dabao. Ek link milega.
4. Ye link EG Eloma Page ke **Super admin** ko bhejo. Wo login karke link khole aur **Verify** dabaye.
5. Settings tab pe status **Verified** dikhna chahiye.

Verify kiye bina **Community Management API** ka request nahi hota.

---

## Step 3: Community Management API request karo (sabse zaroori step)

Isi API se Page ke figures padhe jaate hain aur Page pe post hota hai.

1. **Products** tab kholo, **Community Management API** dhundho, phir **Request access** dabao.
2. **Ek zaroori rule:** LinkedIn ye API sirf aisi app ko deta hai jismein doosra koi product na ho. Agar "Sign In with LinkedIn" ya "Share on LinkedIn" pehle se add hai, to LinkedIn mana karega. Aisa ho to is kaam ke liye **nayi khaali app** banao (Step 1 dobara).
3. **Access request form** bharo:

| Field | Kya likhna hai |
|---|---|
| Legal business name | EG Eloma ka registered naam |
| Business website | `https://teamegdigital.com` |
| Business email | `connect@egeloma.com.au` |
| Registered address | Company ka registered address |
| Privacy policy | `https://teamegdigital.com/privacy` |

**Use case** (ise English mein copy-paste karo):

> We are a digital marketing agency in Australia. Our client portal (teamegdigital.com) lets each client connect their own LinkedIn company Page. We use the Community Management API to (1) show the Page's analytics (impressions, clicks, reactions, comments, reposts, followers and page views) in the client's monthly report, and (2) publish posts to the client's Page only after the client has approved them in our content calendar. A Page admin of the client signs in with LinkedIn and chooses the Page. We do not read member profiles beyond the signed-in admin's name, and we do not message members.

4. Submit karo. LinkedIn review karke pehle **Development tier** deta hai. Aam taur pe kuch din se 1–2 hafte lagte hain, aur email aata hai.
   - **Development tier:** testing ke liye. API calls ki limit kam hoti hai, aur sirf test ke liye istemal karna hota hai.
   - **Standard tier:** real clients ke liye. Iska alag review hota hai, jo Step 8 mein hai.

LinkedIn kabhi-kabhi extra sawaal email pe poochta hai, jaise company documents ya app ka screenshot. Wo mujhe bhej dena, jawab likhwa dunga.

---

## Step 4: Auth settings (Redirect URL aur scopes)

1. **Auth** tab kholo.
2. **Application credentials** mein ye do cheezein hain. Inhe Step 5 mein Azure mein daalna hai.
   - **Client ID**
   - **Primary Client Secret**
3. **OAuth 2.0 settings** mein **Authorized redirect URLs for your app** ke paas pencil ✏️ dabao, phir **Add redirect URL**, aur ye bilkul exact daalo:
   ```
   https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/linkedin/callback
   ```
   Phir **Update** dabao. Ek bhi character alag hua (`/` extra, `http` instead of `https`), to login pe "redirect_uri mismatch" error aayega.
4. **OAuth 2.0 scopes** (Community Management approve hone ke baad dikhte hain). Inmein ye 4 hone chahiye:

| Scope | Kis kaam ka |
|---|---|
| `r_basicprofile` | Connect karne wale admin ka naam |
| `rw_organization_admin` | Kaun-kaun se company Pages ye login manage karta hai, aur Page analytics (followers, Page views) |
| `r_organization_social` | Page ke posts aur unke figures |
| `w_organization_social` | Content Calendar se Page pe post |

Portal yahi 4 scopes maangta hai. Agar LinkedIn inmein se koi na de, to mujhe batao. Azure ke `LINKEDIN_SCOPES` se badla ja sakta hai.

---

## Step 5: Keys Azure mein daalo

1. **Azure Portal** kholo, phir **App Services → eg-digital-api** pe jao.
2. Left menu mein **Settings → Environment variables → App settings** pe **+ Add** karke ye 3 settings banao:

| Name | Value |
|---|---|
| `LINKEDIN_CLIENT_ID` | Auth tab ka **Client ID** |
| `LINKEDIN_CLIENT_SECRET` | Auth tab ka **Primary Client Secret** |
| `LINKEDIN_REDIRECT_URI` | `https://eg-digital-api-fcgbfcajbqehgpd5.australiaeast-01.azurewebsites.net/api/social/oauth/linkedin/callback` |

3. **Apply → Confirm** dabao. App 1–2 minute mein restart hoga.

Ye bhi dhyan rakho:
- **Client Secret chat, WhatsApp ya email mein paste mat karna.** Seedha Azure mein daalo.
- `LINKEDIN_API_VERSION` daalne ki zaroorat nahi. Default `202606` hai. LinkedIn har version lagbhag 1 saal chalata hai. Kabhi "API version retired" error aaye, tab ise naye `YYYYMM` pe set karna hai.

Restart ke baad portal mein LinkedIn card pe **Connect LinkedIn** button chalu ho jayega. Abhi wahan "not set up on the server yet" likha hai.

---

## Step 6: Test karo (sirf demo client)

1. Portal mein **demo client** ka task kholo, jismein Content Calendar ya Social Media Dashboard on ho.
2. Do jagah se connect kar sakte ho:
   - **Content Calendar → Accounts → LinkedIn Company Page → Connect LinkedIn**
   - ya **Social Media Dashboard → Connected accounts → LinkedIn Company Page → Connect with LinkedIn**
3. Ek nayi window khulegi. LinkedIn login karo aur **Allow** dabao.
   - Login wala us company Page ka **Super admin ya Content admin** hona chahiye, warna Page list mein nahi aayega.
   - Test ke liye EG Eloma ka apna Page ya koi test Page use karo, client ka Page nahi.
4. Window "Account connected" dikhakar band ho jayegi.
5. Agar login kai Pages manage karta hai, to **Company Page** dropdown se sahi Page chuno.
6. Dashboard mein **LinkedIn** channel kholo. Figures 1–2 minute mein aa jayenge. Pichhle ~6 mahine ka data padha jaata hai, aur LinkedIn max 12 mahine ka deta hai.
7. Content Calendar mein ek test post banao:
   - **LinkedIn** tick karo
   - text likho, ya JPG/PNG image chuno
   - approve karwao (admin client ki taraf se approve kar sakta hai)
   - **Publish now** dabao
8. Page pe post aana chahiye. Calendar mein **View on LinkedIn** link aa jayega.

Kuch galat ho to error ka screenshot bhej dena.

---

## Step 7: Common errors aur unka matlab

| Error | Matlab / kya karna hai |
|---|---|
| `unauthorized_scope_error` (login window mein) | Community Management API abhi approve nahi hua, ya scope app mein nahi hai. Step 3 aur Step 4 check karo. |
| `redirect_uri does not match` | Auth tab ka redirect URL aur Azure ka `LINKEDIN_REDIRECT_URI` bilkul ek jaise nahi hain. |
| "not an admin of any company Page" | Login wala Page ka admin nahi hai. Page Super admin use admin banaye, phir **Reconnect LinkedIn**. |
| "LinkedIn did not allow this…" (403) | Login wala Analyst hai (post nahi kar sakta), ya app Development tier ki limit pe hai. |
| "API version … retired" (426) | Azure mein `LINKEDIN_API_VERSION` ko naye `YYYYMM` pe set karo. |
| Card pe "Expired" | 60 din wala token khatam ho gaya. **Reconnect LinkedIn** dabao. |

---

## Step 8: Standard tier ke liye apply karo (real clients ke liye)

Development tier pe sab test ho jaye, tab:

1. **Products → Community Management API → View details / Request upgrade** (Standard tier) pe jao.
2. LinkedIn ko **demo video (screen recording)** chahiye, demo client pe:
   1. Portal mein **Connect LinkedIn** dabana, phir LinkedIn ka consent screen aur **Allow**
   2. **Company Page** dropdown se Page chunna
   3. Social Media Dashboard mein LinkedIn ke figures (overview, content, followers, visitors)
   4. Content Calendar mein post banana, approve karna, **Publish now**
   5. LinkedIn Page pe wo post dikhana
   6. **Disconnect** dabana (dikhana ki access hataya ja sakta hai)
3. Video YouTube (unlisted) ya Google Drive link pe daalo aur form mein do. Use case wahi Step 3 wala.
4. Approval mein aam taur pe kuch din se kuch hafte lagte hain. Reject ho to LinkedIn ka reason mujhe bhej dena.

Video ka script chahiye to bata dena, likh dunga.

---

## Step 9: Approval ke baad (real clients)

- Real client ("3 two 1", "The Himalayan") ka **Page admin** apne portal mein **Connected accounts → Connect LinkedIn** dabayega, apne LinkedIn se login karega, aur Page chunega.
- Isse pehle client ke Page pe kuch test nahi karna.
- Agar client chahe ki EG Eloma team connect kare, to client hamare team member ko Page ka **Content admin** bana de. Tab team member connect kar sakta hai.

---

## LinkedIn ke rules jo yaad rakhne hain

- **Token:** access token **60 din** chalta hai. Card pe "access lasts until …" date dikhti hai.
  - Agar LinkedIn app ko refresh token deta hai (Standard tier pe aksar milta hai), to portal khud renew karta rahega.
  - Warna 60 din baad **Reconnect LinkedIn** dabana hoga.
- **Caption:** 3000 characters tak. `#hashtag` apne aap LinkedIn hashtag ban jaate hain.
- **Image:** JPG, PNG ya GIF.
- **Video:** MP4, 500 MB tak. Ek post mein ek hi image ya video jaata hai.
- **First comment:** LinkedIn apps ko nahi deta. Post publish ho jayega aur warning dikhegi.
- **Figures:** LinkedIn daily figures sirf pichhle ~12 mahine ke deta hai.
- **Kharcha:** LinkedIn API free hai.
- LinkedIn portal ke menu ke naam kabhi-kabhi badal jaate hain. Koi option exactly is naam se na mile, to screenshot bhej dena.
