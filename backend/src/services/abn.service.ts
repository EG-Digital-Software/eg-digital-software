import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * ABN lookup against the Australian Business Register (abr.business.gov.au).
 *
 * The operator types an ABN on the customer form and the register fills in the
 * company details it holds. Like the reverse-geocode lookup this is proxied
 * through the API rather than called from the browser: the ABR GUID is a
 * credential that must never ship to the client, the register sees one
 * identifiable caller, and swapping providers never touches the frontend.
 *
 * Two routes to the same public data, in order of preference:
 *
 *  1. The JSON web service, when ABR_GUID is configured. This is the register's
 *     sanctioned interface — a stable contract that will not shift under us.
 *  2. The public ABN Lookup page, parsed from HTML. The GUID is issued per
 *     registered party and cannot be provisioned from here, so without it the
 *     feature would sit dead on arrival; this keeps it working out of the box.
 *     It reads the same public record, but it is markup — a site redesign can
 *     break it. Configure ABR_GUID and route 1 takes over automatically.
 *
 * Every filled field stays editable — the lookup is a shortcut, not a lock-in.
 */

export interface AbnLookupResult {
  /** 11 bare digits, as stored. */
  abn: string;
  /** "Active" / "Cancelled"; blank when the register omits it. */
  abnStatus: string;
  abnStatusFrom: string;
  /** 9 bare digits, or '' for entities without an ACN (sole traders, trusts). */
  acn: string;
  /** Legal entity name — maps to the form's Business Name. */
  entityName: string;
  /** Registered business/trading names; the first maps to Trading As. */
  businessNames: string[];
  entityTypeCode: string;
  entityTypeName: string;
  /** The register only publishes the postcode and state of the main address. */
  postcode: string;
  state: string;
  /** GST registration date, or '' when not registered. */
  gstFrom: string;
}

/** Shape of the ABR's JSONP payload (fields absent on some entity types). */
interface AbrPayload {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string;
  Acn?: string;
  AddressDate?: string | null;
  AddressPostcode?: string;
  AddressState?: string;
  BusinessName?: string[];
  EntityName?: string;
  EntityTypeCode?: string;
  EntityTypeName?: string;
  Gst?: string | null;
  Message?: string;
}

const TIMEOUT_MS = 8000;

/**
 * The ATO's ABN check digit algorithm: subtract 1 from the leading digit, apply
 * the positional weights, and the total must divide by 89. Running it here
 * turns a typo into an instant, precise error instead of a round trip to the
 * register that comes back as a bare "not found".
 */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function isValidAbn(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const total = digits
    .split('')
    .map(Number)
    .reduce((sum, digit, i) => sum + (i === 0 ? digit - 1 : digit) * ABN_WEIGHTS[i], 0);
  return total % 89 === 0;
}

export async function lookupAbn(rawAbn: string): Promise<AbnLookupResult> {
  const abn = rawAbn.replace(/\D/g, '');

  if (!isValidAbn(abn)) {
    throw ApiError.badRequest('That is not a valid ABN — check the 11 digits and try again');
  }
  if (!env.ABN_LOOKUP_ENABLED) {
    throw ApiError.badRequest('ABN lookup is disabled on this environment');
  }
  if (!env.ABR_GUID) {
    logger.warn(
      'ABR_GUID is not configured — falling back to the public ABN Lookup page. ' +
        'Register for a GUID at https://abr.business.gov.au/Documentation/WebServiceRegistration'
    );
    return lookupViaPublicPage(abn);
  }

  const url = new URL('/json/AbnDetails.aspx', env.ABR_URL);
  url.searchParams.set('abn', abn);
  url.searchParams.set('guid', env.ABR_GUID);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let body: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/javascript' },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'ABR returned an error');
      throw ApiError.badGateway(
        'The Business Register is unavailable, please enter the details manually'
      );
    }
    body = await res.text();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err }, 'ABN lookup failed');
    throw ApiError.badGateway(
      aborted
        ? 'ABN lookup timed out, please enter the details manually'
        : 'Could not reach the Business Register, please enter the details manually'
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = parseJsonp(body);

  // The ABR answers with HTTP 200 and an explanatory Message for every failure,
  // including a rejected GUID — so the message, not the status, is the signal.
  if (payload.Message) {
    if (/guid/i.test(payload.Message)) {
      logger.error({ message: payload.Message }, 'ABR rejected the configured GUID');
      throw ApiError.badRequest(
        'ABN lookup is not configured correctly — ask an administrator to check the ABR credential'
      );
    }
    throw ApiError.notFound(payload.Message);
  }
  if (!payload.Abn) {
    throw ApiError.notFound('No business found for that ABN');
  }

  return {
    abn: (payload.Abn ?? '').replace(/\D/g, ''),
    abnStatus: payload.AbnStatus ?? '',
    abnStatusFrom: payload.AbnStatusEffectiveFrom ?? '',
    acn: (payload.Acn ?? '').replace(/\D/g, ''),
    entityName: payload.EntityName ?? '',
    businessNames: (payload.BusinessName ?? []).filter(Boolean),
    entityTypeCode: payload.EntityTypeCode ?? '',
    entityTypeName: payload.EntityTypeName ?? '',
    postcode: payload.AddressPostcode ?? '',
    state: payload.AddressState ?? '',
    gstFrom: payload.Gst ?? '',
  };
}

/**
 * The ABR's JSON endpoint always answers as JSONP — `callback({...})` — so the
 * wrapper has to come off before parsing.
 */
function parseJsonp(body: string): AbrPayload {
  const start = body.indexOf('(');
  const end = body.lastIndexOf(')');
  const json = start !== -1 && end > start ? body.slice(start + 1, end) : body;

  try {
    return JSON.parse(json) as AbrPayload;
  } catch (err) {
    logger.warn({ err, body: body.slice(0, 200) }, 'Could not parse the ABR response');
    throw ApiError.badGateway(
      'The Business Register sent an unreadable response, please enter the details manually'
    );
  }
}

// ── Public page fallback ─────────────────────────────────
// Used when no ABR_GUID is configured. The page is server-rendered with a
// simple `<th>Label:</th><td>value</td>` layout per detail, plus one table each
// for business names and the ASIC number.

/** Strip tags and decode the few entities the register's markup actually uses. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Value of the `<th>Label:</th><td>…</td>` detail row whose label starts with
 * `label`. Every row is walked and compared as plain text, which sidesteps
 * building a regex out of a caller-supplied label.
 */
const DETAIL_ROW = /<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>/g;

function detailRow(html: string, label: string): string {
  const wanted = label.toLowerCase();
  for (const [, rawLabel, rawValue] of html.matchAll(DETAIL_ROW)) {
    if (text(rawLabel).toLowerCase().startsWith(wanted)) return text(rawValue);
  }
  return '';
}

/** Body of the table whose `<caption>` contains `caption`, or '' if absent. */
function tableByCaption(html: string, caption: string): string {
  const capAt = html.indexOf(caption);
  if (capAt === -1) return '';
  const start = html.lastIndexOf('<table', capAt);
  const end = html.indexOf('</table>', capAt);
  return start === -1 || end === -1 ? '' : html.slice(start, end);
}

/**
 * The register writes status and GST as "<state> from <date>" — split the two
 * so the form gets a bare status and the panel gets a date.
 */
function splitFrom(value: string): { head: string; from: string } {
  const m = /^(.*?)\s+from\s+(.*)$/i.exec(value);
  return m ? { head: m[1].trim(), from: m[2].trim() } : { head: value, from: '' };
}

async function lookupViaPublicPage(abn: string): Promise<AbnLookupResult> {
  const url = new URL('/ABN/View', env.ABR_URL);
  url.searchParams.set('abn', abn);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html', 'User-Agent': env.ABR_USER_AGENT },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'ABN Lookup page returned an error');
      throw ApiError.badGateway(
        'The Business Register is unavailable, please enter the details manually'
      );
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err }, 'ABN lookup failed');
    throw ApiError.badGateway(
      aborted
        ? 'ABN lookup timed out, please enter the details manually'
        : 'Could not reach the Business Register, please enter the details manually'
    );
  } finally {
    clearTimeout(timer);
  }

  const entityName = detailRow(html, 'Entity name');
  if (!entityName) {
    // The register answers 200 with an "Invalid ABN" page for anything it does
    // not hold, so a genuine miss has to be told apart from a parse failure.
    // Without this check a redesigned page would report every ABN as unknown —
    // sending the operator to re-check a number that was correct all along.
    // Two distinct miss pages: "ABN not found" for a well-formed number the
    // register does not hold, "Invalid ABN" for one that fails its check digits.
    if (/ABN not found|No record found matching ABN|is not a valid ABN|Invalid ABN/i.test(html)) {
      throw ApiError.notFound('No business found for that ABN');
    }
    logger.error(
      'Could not read the ABN Lookup page — its markup has probably changed. ' +
        'Set ABR_GUID to use the JSON web service instead.'
    );
    throw ApiError.badGateway(
      'Could not read the response from the Business Register, please enter the details manually'
    );
  }

  const status = splitFrom(detailRow(html, 'ABN status'));
  const gst = splitFrom(detailRow(html, 'Goods & Services Tax'));
  // Main business location reads "VIC 3000" — state then postcode.
  const location = /^([A-Z]{2,3})\s+(\d{4})$/.exec(detailRow(html, 'Main business location'));

  const acnTable = tableByCaption(html, 'ASIC registration');
  const acn = (/(\d{3}\s?\d{3}\s?\d{3})/.exec(text(acnTable))?.[1] ?? '').replace(/\D/g, '');

  // Each data row of the business-name table is "<td>name</td><td>from</td>";
  // the leading rows are the blurb and the column headers, which carry no <td>
  // name link, so taking the first cell of every row and dropping the headings
  // is enough.
  const nameTable = tableByCaption(html, 'Business name(s)');
  const businessNames = [...nameTable.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>/g)]
    .map((m) => text(m[1]))
    .filter(Boolean);

  return {
    abn,
    abnStatus: status.head,
    abnStatusFrom: status.from,
    acn,
    entityName,
    businessNames,
    entityTypeCode: '',
    entityTypeName: detailRow(html, 'Entity type'),
    postcode: location?.[2] ?? '',
    state: location?.[1] ?? '',
    gstFrom: /not/i.test(gst.head) ? '' : gst.from,
  };
}
