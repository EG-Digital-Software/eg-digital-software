import {
  Package,
  Globe,
  Server,
  Lock,
  Mail,
  LayoutTemplate,
  Cloud,
  Database,
  Smartphone,
  ShieldCheck,
  Megaphone,
  CreditCard,
  LifeBuoy,
  BarChart3,
  HardDrive,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';
import {
  siGoogle,
  siGooglecloud,
  siWordpress,
  siWoocommerce,
  siCloudflare,
  siGodaddy,
  siCpanel,
  siPlesk,
  siNginx,
  siLetsencrypt,
  siShopify,
  siWix,
  siSquarespace,
  siNamecheap,
  siDigitalocean,
  siMailchimp,
  siZoom,
} from 'simple-icons';

interface SimpleIcon {
  path: string;
  hex: string;
  title: string;
}

/** Render a simple-icons brand glyph in its official brand colour. */
function Brand({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={className} fill={`#${icon.hex}`} aria-label={icon.title}>
      <path d={icon.path} />
    </svg>
  );
}

/** Microsoft four-square logo (used for Microsoft 365 / Office / Teams / Windows). */
function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Microsoft">
      <path fill="#F25022" d="M1.5 1.5h9.5v9.5h-9.5z" />
      <path fill="#7FBA00" d="M13 1.5h9.5v9.5H13z" />
      <path fill="#00A4EF" d="M1.5 13h9.5v9.5h-9.5z" />
      <path fill="#FFB900" d="M13 13h9.5v9.5H13z" />
    </svg>
  );
}

/** Microsoft Azure logo (two blue triangles). */
function AzureLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Microsoft Azure">
      <defs>
        <linearGradient id="pi-azure-a" x1="7" y1="3" x2="4" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#114A8B" />
          <stop offset="1" stopColor="#0669BC" />
        </linearGradient>
        <linearGradient id="pi-azure-b" x1="13" y1="4" x2="12" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3CCBF4" />
          <stop offset="1" stopColor="#2892DF" />
        </linearGradient>
      </defs>
      <path
        fill="url(#pi-azure-a)"
        d="M8.75 3h4.63L8.57 17.24a.79.79 0 0 1-.75.54H4.06a.79.79 0 0 1-.75-1.04L7.99 3.54A.79.79 0 0 1 8.75 3Z"
      />
      <path fill="#0078D4" d="M15.02 15.35H7.6a.37.37 0 0 0-.25.63l2.36 2.2a.79.79 0 0 0 .54.21h5.9z" />
      <path
        fill="url(#pi-azure-b)"
        d="M13.63 3.54A.79.79 0 0 0 12.88 3H8.8a.79.79 0 0 1 .75.54l4.68 13.2a.79.79 0 0 1-.75 1.04h4.06a.79.79 0 0 0 .75-1.04z"
      />
    </svg>
  );
}

/** Amazon Web Services smile (AWS logo was removed from simple-icons). */
function AwsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Amazon Web Services">
      <path
        fill="#232F3E"
        d="M7.4 10.6c0 .3 0 .55.1.73.09.18.2.37.36.58a.35.35 0 0 1 .06.19c0 .08-.05.16-.16.24l-.53.35a.4.4 0 0 1-.22.08c-.08 0-.16-.04-.24-.12a2.5 2.5 0 0 1-.29-.38 6.2 6.2 0 0 1-.25-.48c-.62.73-1.4 1.1-2.34 1.1-.67 0-1.2-.19-1.59-.57-.39-.38-.59-.9-.59-1.53 0-.68.24-1.23.72-1.64.48-.42 1.12-.62 1.94-.62.27 0 .55.02.84.06.3.05.6.11.92.19v-.58c0-.6-.13-1.02-.37-1.27-.25-.25-.68-.37-1.29-.37-.28 0-.56.03-.85.1-.29.07-.57.16-.85.27a2.3 2.3 0 0 1-.27.1.5.5 0 0 1-.13.03c-.11 0-.17-.08-.17-.25v-.4c0-.13.02-.22.06-.28a.6.6 0 0 1 .23-.17c.28-.14.61-.26 1-.36.39-.1.8-.15 1.24-.15.94 0 1.63.21 2.08.64.44.43.66 1.08.66 1.95v2.57Zm-3.23 1.21c.26 0 .53-.05.82-.14.28-.1.53-.27.75-.5.13-.15.22-.32.27-.51.05-.19.08-.42.08-.69v-.33a6.7 6.7 0 0 0-.74-.14 6 6 0 0 0-.75-.05c-.54 0-.93.1-1.2.32-.26.21-.39.51-.39.91 0 .38.1.66.29.85.19.2.46.29.8.29Zm6.38.86c-.15 0-.25-.03-.32-.08-.07-.05-.13-.16-.18-.31L7.9 5.77a1.4 1.4 0 0 1-.07-.32c0-.13.06-.2.19-.2h.82c.16 0 .27.03.33.08.07.05.12.16.17.31l1.35 5.32 1.25-5.32c.04-.16.09-.26.16-.31.07-.05.19-.08.34-.08h.67c.16 0 .27.03.34.08.07.05.13.16.16.31l1.27 5.38 1.39-5.38c.05-.16.11-.26.17-.31a.55.55 0 0 1 .33-.08h.78c.13 0 .2.06.2.2 0 .04 0 .08-.02.13a1.2 1.2 0 0 1-.05.2l-1.94 6.18c-.05.16-.11.26-.18.31a.55.55 0 0 1-.32.08h-.72c-.16 0-.27-.03-.34-.08-.07-.06-.13-.16-.16-.32l-1.24-5.18-1.24 5.17c-.04.16-.09.26-.16.32-.07.05-.19.08-.34.08h-.72Z"
      />
      <path
        fill="#FF9900"
        d="M18.9 15.57c-1.87 1.38-4.58 2.11-6.92 2.11-3.27 0-6.22-1.21-8.45-3.22-.17-.16-.02-.37.19-.25 2.4 1.4 5.38 2.24 8.45 2.24 2.07 0 4.35-.43 6.45-1.32.31-.14.58.2.28.42Zm.78-.9c-.24-.3-1.57-.15-2.17-.07-.18.02-.21-.14-.05-.26 1.06-.74 2.8-.53 3-.28.2.26-.06 2-1.05 2.83-.15.13-.3.06-.23-.11.23-.55.73-1.79.5-2.09Z"
      />
    </svg>
  );
}

type Glyph = (className?: string) => ReactElement;

// Brand rules — first keyword match wins, so put specific brands first.
const BRANDS: Array<[RegExp, Glyph]> = [
  [/azure/, (c) => <AzureLogo className={c} />],
  [/microsoft|office|o365|365|outlook|teams|sharepoint|onedrive|windows/, (c) => <MicrosoftLogo className={c} />],
  [/google\s*cloud|gcp/, (c) => <Brand icon={siGooglecloud} className={c} />],
  [/gmail|google|g\s*suite|workspace/, (c) => <Brand icon={siGoogle} className={c} />],
  [/woocommerce/, (c) => <Brand icon={siWoocommerce} className={c} />],
  [/wordpress|wp\b/, (c) => <Brand icon={siWordpress} className={c} />],
  [/cloudflare/, (c) => <Brand icon={siCloudflare} className={c} />],
  [/\baws\b|amazon/, (c) => <AwsLogo className={c} />],
  [/godaddy/, (c) => <Brand icon={siGodaddy} className={c} />],
  [/cpanel/, (c) => <Brand icon={siCpanel} className={c} />],
  [/plesk/, (c) => <Brand icon={siPlesk} className={c} />],
  [/nginx/, (c) => <Brand icon={siNginx} className={c} />],
  [/let'?s\s*encrypt|letsencrypt/, (c) => <Brand icon={siLetsencrypt} className={c} />],
  [/shopify/, (c) => <Brand icon={siShopify} className={c} />],
  [/\bwix\b/, (c) => <Brand icon={siWix} className={c} />],
  [/squarespace/, (c) => <Brand icon={siSquarespace} className={c} />],
  [/namecheap/, (c) => <Brand icon={siNamecheap} className={c} />],
  [/digital\s*ocean/, (c) => <Brand icon={siDigitalocean} className={c} />],
  [/mailchimp/, (c) => <Brand icon={siMailchimp} className={c} />],
  [/zoom/, (c) => <Brand icon={siZoom} className={c} />],
];

// Generic category rules — coloured Lucide icons when no brand matches.
const CATEGORIES: Array<[RegExp, ComponentType<LucideProps>, string]> = [
  [/\bssl\b|certificate|https/, Lock, '#059669'],
  [/domain|dns/, Globe, '#2563eb'],
  [/host|hosting|vps|server/, Server, '#4f46e5'],
  [/email|\bmail\b|smtp|inbox/, Mail, '#0284c7'],
  [/web\s*design|website|landing|webpage|web\s*dev/, LayoutTemplate, '#7c3aed'],
  [/cloud/, Cloud, '#0ea5e9'],
  [/database|\bsql\b|postgres|mysql/, Database, '#0891b2'],
  [/security|firewall|antivirus|vpn|protect/, ShieldCheck, '#10b981'],
  [/seo|marketing|advert|campaign|social/, Megaphone, '#ea580c'],
  [/backup|storage|disk|\bnas\b/, HardDrive, '#64748b'],
  [/\bapp\b|mobile|android|\bios\b/, Smartphone, '#c026d3'],
  [/payment|billing|invoice|checkout|gateway/, CreditCard, '#0d9488'],
  [/support|maintenance|helpdesk|\bsla\b/, LifeBuoy, '#e11d48'],
  [/analytic|report|insight|metric/, BarChart3, '#d97706'],
];

/**
 * Product logo/icon chosen from any descriptive text (name, category, type).
 * Prefers an official brand logo (Azure, Microsoft, Google, WordPress…),
 * then a colour-coded category icon, and finally a neutral package icon.
 */
export function ProductGlyph({
  parts,
  className,
}: {
  parts: Array<string | null | undefined>;
  className?: string;
}) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();

  for (const [re, render] of BRANDS) {
    if (re.test(text)) return render(className);
  }
  for (const [re, Icon, color] of CATEGORIES) {
    if (re.test(text)) return <Icon className={className} style={{ color }} />;
  }
  return <Package className={className} style={{ color: '#64748b' }} />;
}
