import { DEFAULT_COUNTRY } from '@/lib/countries';

/**
 * ISO-3166 alpha-2 country → ISO-4217 currency it prices in. Covers every
 * country in COUNTRIES; anything unknown falls back to the default country's.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  AF: 'AFN', AX: 'EUR', AL: 'ALL', DZ: 'DZD', AS: 'USD', AD: 'EUR', AO: 'AOA', AI: 'XCD',
  AQ: 'USD', AG: 'XCD', AR: 'ARS', AM: 'AMD', AW: 'AWG', AU: 'AUD', AT: 'EUR', AZ: 'AZN',
  BS: 'BSD', BH: 'BHD', BD: 'BDT', BB: 'BBD', BY: 'BYN', BE: 'EUR', BZ: 'BZD', BJ: 'XOF',
  BM: 'BMD', BT: 'BTN', BO: 'BOB', BQ: 'USD', BA: 'BAM', BW: 'BWP', BR: 'BRL', IO: 'USD',
  BN: 'BND', BG: 'BGN', BF: 'XOF', BI: 'BIF', CV: 'CVE', KH: 'KHR', CM: 'XAF', CA: 'CAD',
  KY: 'KYD', CF: 'XAF', TD: 'XAF', CL: 'CLP', CN: 'CNY', CX: 'AUD', CC: 'AUD', CO: 'COP',
  KM: 'KMF', CK: 'NZD', CR: 'CRC', CI: 'XOF', HR: 'EUR', CU: 'CUP', CW: 'ANG', CY: 'EUR',
  CZ: 'CZK', CD: 'CDF', DK: 'DKK', DJ: 'DJF', DM: 'XCD', DO: 'DOP', EC: 'USD', EG: 'EGP',
  SV: 'USD', GQ: 'XAF', ER: 'ERN', EE: 'EUR', SZ: 'SZL', ET: 'ETB', FK: 'FKP', FO: 'DKK',
  FM: 'USD', FJ: 'FJD', FI: 'EUR', FR: 'EUR', GF: 'EUR', PF: 'XPF', TF: 'EUR', GA: 'XAF',
  GM: 'GMD', GE: 'GEL', DE: 'EUR', GH: 'GHS', GI: 'GIP', GR: 'EUR', GL: 'DKK', GD: 'XCD',
  GP: 'EUR', GU: 'USD', GT: 'GTQ', GG: 'GBP', GN: 'GNF', GW: 'XOF', GY: 'GYD', HT: 'HTG',
  VA: 'EUR', HN: 'HNL', HK: 'HKD', HU: 'HUF', IS: 'ISK', IN: 'INR', ID: 'IDR', IR: 'IRR',
  IQ: 'IQD', IE: 'EUR', IM: 'GBP', IL: 'ILS', IT: 'EUR', JM: 'JMD', JP: 'JPY', JE: 'GBP',
  JO: 'JOD', KZ: 'KZT', KE: 'KES', KI: 'AUD', KW: 'KWD', KG: 'KGS', LA: 'LAK', LV: 'EUR',
  LB: 'LBP', LS: 'LSL', LR: 'LRD', LY: 'LYD', LI: 'CHF', LT: 'EUR', LU: 'EUR', MO: 'MOP',
  MG: 'MGA', MW: 'MWK', MY: 'MYR', MV: 'MVR', ML: 'XOF', MT: 'EUR', MH: 'USD', MQ: 'EUR',
  MR: 'MRU', MU: 'MUR', YT: 'EUR', MX: 'MXN', MD: 'MDL', MC: 'EUR', MN: 'MNT', ME: 'EUR',
  MS: 'XCD', MA: 'MAD', MZ: 'MZN', MM: 'MMK', NA: 'NAD', NR: 'AUD', NP: 'NPR', NL: 'EUR',
  NC: 'XPF', NZ: 'NZD', NI: 'NIO', NE: 'XOF', NG: 'NGN', NU: 'NZD', NF: 'AUD', KP: 'KPW',
  MK: 'MKD', MP: 'USD', NO: 'NOK', OM: 'OMR', PK: 'PKR', PW: 'USD', PA: 'PAB', PG: 'PGK',
  PY: 'PYG', PE: 'PEN', PH: 'PHP', PN: 'NZD', PL: 'PLN', PT: 'EUR', PR: 'USD', QA: 'QAR',
  CG: 'XAF', RE: 'EUR', RO: 'RON', RU: 'RUB', RW: 'RWF', BL: 'EUR', SH: 'SHP', KN: 'XCD',
  LC: 'XCD', MF: 'EUR', PM: 'EUR', VC: 'XCD', WS: 'WST', SM: 'EUR', ST: 'STN', SA: 'SAR',
  SN: 'XOF', RS: 'RSD', SC: 'SCR', SL: 'SLE', SG: 'SGD', SX: 'ANG', SK: 'EUR', SI: 'EUR',
  SB: 'SBD', SO: 'SOS', ZA: 'ZAR', GS: 'GBP', KR: 'KRW', SS: 'SSP', ES: 'EUR', LK: 'LKR',
  PS: 'ILS', SD: 'SDG', SR: 'SRD', SJ: 'NOK', SE: 'SEK', CH: 'CHF', SY: 'SYP', TW: 'TWD',
  TJ: 'TJS', TZ: 'TZS', TH: 'THB', TL: 'USD', TG: 'XOF', TK: 'NZD', TO: 'TOP', TT: 'TTD',
  TN: 'TND', TR: 'TRY', TM: 'TMT', TC: 'USD', TV: 'AUD', UG: 'UGX', UA: 'UAH', AE: 'AED',
  GB: 'GBP', UM: 'USD', US: 'USD', UY: 'UYU', UZ: 'UZS', VU: 'VUV', VE: 'VES', VN: 'VND',
  VG: 'USD', VI: 'USD', WF: 'XPF', EH: 'MAD', YE: 'YER', ZM: 'ZMW', ZW: 'USD',
};

/** Currency code a country prices in (e.g. IN → INR). */
export function currencyOf(country?: string | null): string {
  return COUNTRY_CURRENCY[(country || '').toUpperCase()] ?? COUNTRY_CURRENCY[DEFAULT_COUNTRY];
}

/** Formatter in the country's own style — symbol, grouping and decimals. */
function formatterFor(country?: string | null, opts: Intl.NumberFormatOptions = {}) {
  const code = (country || DEFAULT_COUNTRY).toUpperCase();
  const currency = currencyOf(code);
  try {
    return new Intl.NumberFormat(`en-${code}`, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...opts });
  } catch {
    return new Intl.NumberFormat('en', { style: 'currency', currency, ...opts });
  }
}

/** Short symbol for a country's currency, e.g. "₹", "$", "£". */
export function currencySymbolOf(country?: string | null): string {
  return formatterFor(country).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currencyOf(country);
}

/** Price in the country's currency, e.g. IN 1500 → "₹1,500.00". */
export function formatCountryPrice(value: number | string | null | undefined, country?: string | null): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return formatterFor(country).format(Number.isFinite(n) ? n : 0);
}
