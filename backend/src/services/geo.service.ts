import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Reverse geocoding for the address forms. The operator's browser supplies the
 * coordinates (with their permission) and this service turns them into a
 * street/city/postcode/country the form can prefill — every field stays
 * editable afterwards.
 *
 * The lookup is proxied through the API rather than called from the browser so
 * the provider sees one identifiable caller, the URL/contact stay configurable
 * per environment, and switching providers never touches the frontend.
 */

export interface ReverseGeocodeResult {
  line1: string;
  city: string;
  postcode: string;
  /** Country display name, matching what Address.country stores. */
  country: string;
  /** ISO-3166 alpha-2, upper case. */
  countryCode: string;
  /**
   * How tightly the coordinates matched. 'approximate' means the provider only
   * resolved a town or larger, so the postcode describes a wide area and should
   * be checked rather than trusted.
   */
  precision: 'exact' | 'approximate';
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  // Named features the point may sit on when no street is mapped.
  amenity?: string;
  building?: string;
  shop?: string;
  office?: string;
  // Sub-locality names, finer than the suburb.
  quarter?: string;
  neighbourhood?: string;
  residential?: string;
  hamlet?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  municipality?: string;
  city_district?: string;
  county?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

/**
 * Address types that describe a whole town or larger. A postcode taken from one
 * of these covers far more ground than the point the operator is standing on.
 */
const COARSE_MATCHES = new Set([
  'city',
  // A district can span an entire desert — Nominatim hands back one postcode
  // for the whole of Gibson Desert South.
  'city_district',
  'municipality',
  'county',
  'state',
  'state_district',
  'region',
  'province',
  'country',
  'continent',
]);

const TIMEOUT_MS = 8000;

/** One suggestion for the address autocomplete — a label plus the resolved parts. */
export interface AddressSuggestion {
  /** Human-readable single line, shown in the dropdown. */
  label: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  /** Country display name, matching what Address.country stores. */
  country: string;
  /** ISO-3166 alpha-2, upper case. */
  countryCode: string;
}

interface NominatimSearchHit {
  display_name?: string;
  address?: NominatimAddress;
}

/**
 * Forward geocoding for the address autocomplete: turn a few typed characters
 * into a short list of matching addresses. Optionally scoped to one country so
 * the suggestions stay relevant to the address the operator is filling in.
 *
 * Proxied through the API for the same reasons as the reverse lookup — one
 * identifiable caller, provider config kept server-side.
 */
export async function searchAddresses(
  query: string,
  countryCode?: string
): Promise<AddressSuggestion[]> {
  if (!env.GEOCODING_ENABLED) {
    throw ApiError.badRequest('Location lookup is disabled on this environment');
  }

  const q = query.trim();
  // Suggest from the very first character the operator types.
  if (q.length < 1) return [];

  const url = new URL('/search', env.GEOCODER_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
    url.searchParams.set('countrycodes', countryCode.toLowerCase());
  }
  if (env.GEOCODER_EMAIL) url.searchParams.set('email', env.GEOCODER_EMAIL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let hits: NominatimSearchHit[];
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.GEOCODER_USER_AGENT,
        'Accept-Language': env.DEFAULT_LOCALE,
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Address search provider returned an error');
      throw ApiError.badGateway('Location provider is unavailable, please enter the address manually');
    }
    hits = (await res.json()) as NominatimSearchHit[];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err }, 'Address search failed');
    throw ApiError.badGateway(
      aborted
        ? 'Location lookup timed out, please enter the address manually'
        : 'Could not reach the location provider, please enter the address manually'
    );
  } finally {
    clearTimeout(timer);
  }

  return (Array.isArray(hits) ? hits : [])
    .map((hit) => {
      const a = hit.address ?? {};
      const city =
        a.city || a.town || a.village || a.municipality || a.city_district || a.suburb || a.county || '';
      return {
        label: hit.display_name ?? streetLine(a, city),
        line1: streetLine(a, city),
        // Suburb sits below the city — keep it on line 2 when it isn't the city itself.
        line2: a.suburb && a.suburb !== city ? a.suburb : '',
        city,
        postcode: a.postcode ?? '',
        country: a.country ?? '',
        countryCode: (a.country_code ?? '').toUpperCase(),
      };
    })
    // Only offer rows we could actually turn into a street line.
    .filter((s) => !!s.line1 || !!s.label);
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  if (!env.GEOCODING_ENABLED) {
    throw ApiError.badRequest('Location lookup is disabled on this environment');
  }

  const url = new URL('/reverse', env.GEOCODER_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  // Nominatim's usage policy asks callers to identify themselves.
  if (env.GEOCODER_EMAIL) url.searchParams.set('email', env.GEOCODER_EMAIL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload: { address?: NominatimAddress; addresstype?: string; error?: string };
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.GEOCODER_USER_AGENT,
        'Accept-Language': env.DEFAULT_LOCALE,
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Reverse geocode provider returned an error');
      throw ApiError.badGateway('Location provider is unavailable, please enter the address manually');
    }
    payload = (await res.json()) as typeof payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err }, 'Reverse geocode failed');
    throw ApiError.badGateway(
      aborted
        ? 'Location lookup timed out, please enter the address manually'
        : 'Could not reach the location provider, please enter the address manually'
    );
  } finally {
    clearTimeout(timer);
  }

  const a = payload.address;
  if (!a || payload.error) {
    throw ApiError.notFound('No address found for that location');
  }

  // Providers label the locality differently by country — take the first hit.
  const city =
    a.city || a.town || a.village || a.municipality || a.city_district || a.suburb || a.county || '';

  const precision = COARSE_MATCHES.has(payload.addresstype ?? '') ? 'approximate' : 'exact';

  return {
    line1: streetLine(a, city),
    city,
    // A postcode read off a whole city or state is worse than none — it looks
    // authoritative while being wrong for most of the area it covers.
    postcode: precision === 'exact' ? (a.postcode ?? '') : '',
    country: a.country ?? '',
    countryCode: (a.country_code ?? '').toUpperCase(),
    precision,
  };
}

/**
 * Best available street line, most specific first.
 *
 * Plenty of the world has no house numbers mapped, and some points sit on no
 * street at all — a housing estate, a market, a campus. Falling back through
 * the named feature and the sub-locality means the operator gets the same first
 * line the provider itself shows, instead of an empty box.
 */
function streetLine(a: NominatimAddress, city: string): string {
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const candidate =
    street ||
    a.amenity ||
    a.building ||
    a.shop ||
    a.office ||
    a.quarter ||
    a.neighbourhood ||
    a.residential ||
    a.hamlet ||
    '';

  // Never repeat the locality as the street line — "Patna / Patna" helps nobody.
  return candidate && candidate !== city ? candidate : street;
}
