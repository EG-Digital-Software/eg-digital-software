import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

/**
 * Public legal pages — Privacy Policy, Terms of Service and Data deletion
 * instructions. Linked from the Meta, TikTok, LinkedIn and Google developer apps
 * (required for their logins and Google's app verification), so they must stay public (no login) at /privacy, /terms and
 * /data-deletion.
 */

const UPDATED = '16 November 2026';
/** Privacy and data-deletion requests go to this mailbox. */
const CONTACT = 'connect@egeloma.com.au';
const APP_NAME = 'EG Eloma Dashboard';

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-700">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5">
          <Link to="/">
            <img src={brand.logo} alt={brand.companyName} className="h-9 w-auto" />
          </Link>
          <nav className="flex gap-4 text-sm font-medium text-slate-500">
            <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link to="/terms" className="hover:text-slate-900">Terms</Link>
            <Link to="/data-deletion" className="hover:text-slate-900">Data deletion</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {UPDATED}</p>
        <div className="mt-8 space-y-8 text-[15px] leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_a]:text-emerald-700 [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-slate-500">
          {brand.seller.legalName} · ABN {brand.seller.abn} · {brand.seller.addressLines.join(', ')} · <a href={`mailto:${CONTACT}`} className="underline">{CONTACT}</a>
        </div>
      </footer>
    </div>
  );
}

const Contact = () => (
  <p>
    {brand.seller.legalName}
    <br />
    {brand.seller.addressLines.join(', ')}
    <br />
    Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
  </p>
);

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <section>
        <h2>1. Who we are</h2>
        <p>
          {brand.seller.legalName} (ABN {brand.seller.abn}) provides IT, digital and marketing services and runs this client portal, where our clients
          and team manage tasks, invoices, approvals and reports. This policy explains how we handle personal and business information in the portal,
          including the {APP_NAME} that connects to Facebook, Instagram, Meta Ads, TikTok, LinkedIn, YouTube and Google Ads. We handle personal information in line with the Australian Privacy
          Principles in the Privacy Act 1988 (Cth).
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li>Account details: name, email address, phone number and login details of the people who use the portal.</li>
          <li>Business details: company name, ABN, addresses and contacts you give us.</li>
          <li>Work content: tasks, messages, notes, files, approvals and time records added in the portal.</li>
          <li>Billing details: invoices and payment records. Card payments are handled by our payment provider; we do not store card numbers.</li>
          <li>Technical details: log-in times and basic technical logs needed to keep the portal secure.</li>
        </ul>
      </section>

      <section>
        <h2>3. Social media and advertising accounts you connect</h2>
        <p>
          A client can connect their Facebook Page, Instagram professional account and Meta ad account to the Social Media Dashboard. You sign in on
          Facebook's own page and choose what to allow. We never see or store your Facebook password. With the access you allow we receive and store:
        </p>
        <ul>
          <li>The name and ID of the Facebook account that connected, and the names and IDs of the Pages, Instagram accounts and ad accounts it can access.</li>
          <li>Totals for those accounts: reach, engagement, followers, link clicks, and post-level figures (reach, likes, comments, shares, saves) with the post caption, date and link.</li>
          <li>Ad account figures: spend, impressions, clicks, leads, conversion value, and campaign names and status.</li>
          <li>An access token from Meta that lets the dashboard read these figures. It is stored encrypted.</li>
        </ul>
        <p>
          A client can also connect their TikTok account. You sign in on TikTok&apos;s own page and choose what to allow. We never see or store your
          TikTok password. With the access you allow we receive and store:
        </p>
        <ul>
          <li>The TikTok account&apos;s display name, username, profile picture and profile link.</li>
          <li>Account totals: followers, following, likes and number of videos.</li>
          <li>Your public videos&apos; title, description, date, cover image and link, with their views, likes, comments and shares.</li>
          <li>An access token and a refresh token from TikTok that let the dashboard read these figures and publish posts you approve. They are stored encrypted.</li>
        </ul>
        <p>
          When a post in the Content Calendar is approved and set to publish to TikTok, we send that post&apos;s video or photo, caption and the settings
          chosen for it (who can see it, comments, Duet, Stitch and commercial content disclosure) to TikTok, which publishes it on your account.
        </p>
        <p>
          A client can also connect their LinkedIn company Page. You sign in on LinkedIn&apos;s own page; we never see your LinkedIn password. We
          receive and store the name of the person who connected, the names and IDs of the company Pages they manage, the chosen Page&apos;s totals
          (impressions, clicks, reactions, comments, reposts, followers and Page views), its posts&apos; text, date and link with their figures, and an
          access token (and refresh token where LinkedIn gives one), stored encrypted. Approved Content Calendar posts set to publish to LinkedIn are sent
          with their text and image or video to LinkedIn, which publishes them on the company Page.
        </p>
        <p>
          A client can also connect their YouTube channel and Google Ads account, each by signing in with Google. We never see your Google password.
          For YouTube we receive and store the channel&apos;s name, handle, picture and ID, channel figures from YouTube Analytics (views, watch time,
          subscribers, likes, comments, shares, traffic sources and viewer types), the channel&apos;s videos (title, date, thumbnail, link, views, likes and
          comments), and a Google access token and refresh token, stored encrypted. Approved Content Calendar posts set to publish to YouTube are uploaded
          as videos with the title, description, tags and settings chosen for them (who can see it and whether it is made for kids). For Google Ads we
          receive and store the names and IDs of the ad accounts the login can read and, for the chosen account, spend, impressions, clicks, conversions,
          conversion value, campaign names and status, search impression share and device breakdowns.
        </p>
        <p>
          {APP_NAME} uses YouTube API Services. By connecting YouTube you also agree to the{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and Google&apos;s handling of your
          information is described in the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.{' '}
          {APP_NAME}&apos;s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements.
        </p>
        <p>
          We only receive totals and figures about the business accounts. We do not collect personal information about your followers, the people who
          watch your videos or the people who see your ads.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <ul>
          <li>To provide our services and run the portal, including showing your reports and dashboards to you and to the EG Eloma team working on your account.</li>
          <li>To give advice and recommendations about your social media and advertising.</li>
          <li>To send service emails (for example login codes, approvals and invoices), and for billing and support.</li>
          <li>To meet our legal obligations.</li>
        </ul>
        <p>
          We do not sell information, use it to advertise to you or anyone else, use it to train AI models, or share data from Facebook, Instagram, Meta
          Ads, TikTok, LinkedIn, YouTube or Google Ads with other clients or third parties, except as described below.
        </p>
      </section>

      <section>
        <h2>5. Who we share information with</h2>
        <ul>
          <li>Service providers that run the portal for us: Microsoft Azure (hosting and storage, Australia East region), our email provider and our payment provider.</li>
          <li>Authorities when the law requires it.</li>
        </ul>
      </section>

      <section>
        <h2>6. Storage and security</h2>
        <p>
          Information is stored on Microsoft Azure in Australia. Access is limited to signed-in users with the right role, connections use HTTPS, and
          access tokens for connected accounts are encrypted. Each client only sees their own information.
        </p>
      </section>

      <section>
        <h2>7. How long we keep information</h2>
        <p>
          We keep information while you are our client and as needed for legal and accounting records. When a connected account is disconnected, its
          access token is deleted straight away; figures already collected stay in your report history until you ask us to delete them. See our{' '}
          <Link to="/data-deletion">data deletion instructions</Link>.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <ul>
          <li>
            You can disconnect a social media or ad account at any time in the Social Media Dashboard or the Content Calendar (Connected accounts,
            Disconnect), remove {APP_NAME} in your Facebook settings under Business integrations, remove it in the TikTok app under Settings and
            privacy, Security and permissions, Apps and services permissions, remove it in LinkedIn under Settings, Data privacy, Permitted services,
            or remove it from your Google account at{' '}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">myaccount.google.com/connections</a> (third-party apps
            with account access).
          </li>
          <li>You can ask us for a copy of your information, ask us to correct it, or ask us to delete it.</li>
          <li>
            If you have a privacy complaint, contact us first. If you are not satisfied with our response you can contact the Office of the Australian
            Information Commissioner at <a href="https://www.oaic.gov.au" target="_blank" rel="noreferrer">oaic.gov.au</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Changes to this policy</h2>
        <p>We may update this policy. The date at the top shows when it was last changed.</p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <Contact />
      </section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <section>
        <h2>1. About these terms</h2>
        <p>
          These terms apply to the client portal and the {APP_NAME} run by {brand.seller.legalName} (ABN {brand.seller.abn}) (&quot;EG Eloma&quot;,
          &quot;we&quot;, &quot;us&quot;), including the Social Media Dashboard and the Content Calendar. By signing in or connecting an account you agree
          to them. If you use the portal for a business, you agree for that business and confirm you are allowed to. Your service agreement with EG Eloma
          also applies; if it conflicts with these terms, the service agreement wins.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Keep your login details private and tell us straight away if you think someone else has used them.</li>
          <li>You are responsible for what is done with your login.</li>
          <li>Only give portal access to people who are allowed to act for your business.</li>
        </ul>
      </section>

      <section>
        <h2>3. Connecting social media accounts</h2>
        <p>
          You can connect Facebook, Instagram, Meta Ads, TikTok, LinkedIn, YouTube and Google Ads accounts. You sign in on each platform&apos;s own page; we never see your password. By
          connecting an account you confirm that you own it or are authorised to manage it, and you allow us to read its figures and, where you allow
          it, publish posts to it. You can disconnect at any time. Your use of each platform is also governed by that platform&apos;s own terms,
          including the{' '}
          <a href="https://www.facebook.com/terms" target="_blank" rel="noreferrer">Meta Terms of Service</a>, the{' '}
          <a href="https://www.tiktok.com/legal/page/global/terms-of-service/en" target="_blank" rel="noreferrer">TikTok Terms of Service</a>, the{' '}
          <a href="https://www.linkedin.com/legal/user-agreement" target="_blank" rel="noreferrer">LinkedIn User Agreement</a>, the{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a> (by connecting YouTube you agree to be
          bound by them) and the <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Google Terms of Service</a>. Google Ads
          access is read only.
        </p>
      </section>

      <section>
        <h2>4. Publishing posts</h2>
        <ul>
          <li>Posts in the Content Calendar are published only after you approve them. Approving a post means you are happy for it to be published on the chosen accounts at the time shown.</li>
          <li>
            For each TikTok post, the person posting chooses who can see it, whether comments, Duet and Stitch are allowed, and whether it is commercial
            content, and agrees to TikTok&apos;s Music Usage Confirmation (and Branded Content Policy for branded content).
          </li>
          <li>For each YouTube video, the person posting chooses who can see it (public, unlisted or private) and says whether it is made for kids, as YouTube requires.</li>
          <li>You confirm that you have the rights to the images, videos, music and text you supply or approve, and that they do not break the law or the platform&apos;s rules.</li>
          <li>Platforms can refuse, delay, limit or remove posts. We tell you when a post fails and try again where we can, but we cannot control the platforms.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>Do not use the portal to:</p>
        <ul>
          <li>break any law or anyone else&apos;s rights, including copyright and privacy;</li>
          <li>publish misleading, hateful, harassing or unlawful content, or spam;</li>
          <li>try to get into accounts or data that are not yours, or interfere with the portal&apos;s security or operation.</li>
        </ul>
      </section>

      <section>
        <h2>6. Figures and reports</h2>
        <p>
          Dashboard figures come from the platforms you connect and from what our team enters. Platforms sometimes change, delay or correct their
          figures, so reports are a guide and may differ from what the platform shows later.
        </p>
      </section>

      <section>
        <h2>7. Your content and data</h2>
        <p>
          You keep ownership of your content. You give us permission to store, process and publish it as needed to provide our services. How we handle
          personal information is explained in our <Link to="/privacy">Privacy Policy</Link>, and how to remove access or have data deleted is explained
          in our <Link to="/data-deletion">data deletion instructions</Link>.
        </p>
      </section>

      <section>
        <h2>8. Availability and changes</h2>
        <p>
          We work to keep the portal available and secure, but it may sometimes be unavailable for maintenance or for reasons outside our control. We may
          change or improve features, including when a platform changes what it allows.
        </p>
      </section>

      <section>
        <h2>9. Liability</h2>
        <p>
          Nothing in these terms excludes rights you have under the Australian Consumer Law. To the extent the law allows, we are not liable for indirect
          or consequential loss, or for loss caused by a platform (such as Meta, TikTok, LinkedIn or Google) refusing, removing or changing posts, accounts or figures.
        </p>
      </section>

      <section>
        <h2>10. Ending access</h2>
        <p>
          You can stop using the portal and disconnect your accounts at any time. We may suspend or end access if these terms are broken or when our
          services to you end.
        </p>
      </section>

      <section>
        <h2>11. Changes to these terms</h2>
        <p>We may update these terms. The date at the top shows when they last changed. Continuing to use the portal means you accept the updated terms.</p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>These terms are governed by the laws of Victoria, Australia.</p>
      </section>

      <section>
        <h2>13. Contact us</h2>
        <Contact />
      </section>
    </LegalShell>
  );
}

export function DataDeletionPage() {
  return (
    <LegalShell title="Data deletion instructions">
      <section>
        <p>
          You can remove the access you gave {APP_NAME} and ask us to delete the data we collected from Facebook, Instagram, Meta Ads, TikTok,
          LinkedIn, YouTube and Google Ads at any time. There are three ways, depending on what you want.
        </p>
      </section>

      <section>
        <h2>1. Disconnect in the portal</h2>
        <ol>
          <li>Sign in to the client portal and open the task with the Social Media Dashboard or the Content Calendar.</li>
          <li>Open Connected accounts and choose Disconnect next to the account.</li>
        </ol>
        <p>The access token is deleted straight away (for TikTok, LinkedIn and Google we also ask the platform to end the access) and no new figures are collected.</p>
      </section>

      <section>
        <h2>2. Remove the app in Facebook, TikTok, LinkedIn or Google</h2>
        <ol>
          <li>In Facebook, open Settings and privacy, then Settings.</li>
          <li>Open Business integrations (under Permissions).</li>
          <li>Select {APP_NAME} and choose Remove.</li>
        </ol>
        <p>Facebook stops the access, and the dashboard can no longer read your accounts.</p>
        <p>
          For TikTok: in the TikTok app open Profile, then Settings and privacy, Security and permissions, Apps and services permissions, select{' '}
          {APP_NAME} and choose Remove access.
        </p>
        <p>For LinkedIn: open Settings and privacy, then Data privacy, Permitted services, and remove {APP_NAME}.</p>
        <p>
          For YouTube and Google Ads: open{' '}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">myaccount.google.com/connections</a>, select {APP_NAME} and
          choose Delete all connections (or Remove access).
        </p>
      </section>

      <section>
        <h2>3. Ask us to delete your data</h2>
        <p>
          To have the figures, posts and campaign data we collected deleted, email <a href={`mailto:${CONTACT}?subject=Data%20deletion%20request`}>{CONTACT}</a>{' '}
          with the subject "Data deletion request". Include your business name and the Facebook Page, Instagram, TikTok, LinkedIn, YouTube or Google Ads account it relates to.
        </p>
        <ul>
          <li>We confirm your request within 5 business days.</li>
          <li>We delete the data within 30 days and email you when it is done.</li>
          <li>We may need to confirm that you are authorised to act for the business before deleting.</li>
        </ul>
      </section>

      <section>
        <h2>Contact us</h2>
        <Contact />
        <p>
          See also our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </LegalShell>
  );
}
