import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';

/**
 * Public legal pages — Privacy Policy and Data deletion instructions. Linked from
 * the Meta developer app (required for Facebook / Instagram / Meta Ads login),
 * so they must stay public (no login) at /privacy and /data-deletion.
 */

const UPDATED = '12 November 2026';
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
          including the {APP_NAME} that connects to Facebook, Instagram and Meta Ads. We handle personal information in line with the Australian Privacy
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
          We only receive totals and figures about the business accounts. We do not collect personal information about your followers or the people who
          see your ads.
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
          We do not sell information, use it to advertise to you or anyone else, or share data from Facebook, Instagram or Meta Ads with other clients
          or third parties, except as described below.
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
          <li>You can disconnect a social media or ad account at any time in the Social Media Dashboard (Connected accounts, Disconnect), or remove {APP_NAME} in your Facebook settings under Business integrations.</li>
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

export function DataDeletionPage() {
  return (
    <LegalShell title="Data deletion instructions">
      <section>
        <p>
          You can remove the access you gave {APP_NAME} and ask us to delete the data we collected from Facebook, Instagram and Meta Ads at any time.
          There are three ways, depending on what you want.
        </p>
      </section>

      <section>
        <h2>1. Disconnect in the portal</h2>
        <ol>
          <li>Sign in to the client portal and open the task with the Social Media Dashboard.</li>
          <li>Open Connected accounts and choose Disconnect.</li>
        </ol>
        <p>The access token is deleted straight away and no new figures are collected.</p>
      </section>

      <section>
        <h2>2. Remove the app in Facebook</h2>
        <ol>
          <li>In Facebook, open Settings and privacy, then Settings.</li>
          <li>Open Business integrations (under Permissions).</li>
          <li>Select {APP_NAME} and choose Remove.</li>
        </ol>
        <p>Facebook stops the access, and the dashboard can no longer read your accounts.</p>
      </section>

      <section>
        <h2>3. Ask us to delete your data</h2>
        <p>
          To have the figures, posts and campaign data we collected deleted, email <a href={`mailto:${CONTACT}?subject=Data%20deletion%20request`}>{CONTACT}</a>{' '}
          with the subject "Data deletion request". Include your business name and the Facebook Page or Instagram account it relates to.
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
