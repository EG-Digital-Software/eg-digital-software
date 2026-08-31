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

  // Prefer Google when a key is configured — it returns more precise, better
  // ranked matches. Nominatim remains the zero-config fallback.
  if (env.GOOGLE_MAPS_API_KEY) {
    return googleSearchAddresses(q, countryCode);
  }

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

  if (env.GOOGLE_MAPS_API_KEY) {
    return googleReverseGeocode(lat, lon);
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

// ── Google Geocoding API provider ──────────────────────────
// Used when GOOGLE_MAPS_API_KEY is set. Same request path (API-proxied) and the
// same result shapes as the Nominatim provider, so the frontend never changes.

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleResult {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results?: GoogleResult[];
}

/** First component whose types include `type`. */
function pick(components: GoogleAddressComponent[], type: string): GoogleAddressComponent | undefined {
  return components.find((c) => c.types.includes(type));
}

function componentValue(components: GoogleAddressComponent[], type: string, short = false): string {
  const c = pick(components, type);
  return c ? (short ? c.short_name : c.long_name) : '';
}

/** Map Google's address_components onto our flat suggestion/result fields. */
function mapGoogleComponents(result: GoogleResult) {
  const components = result.address_components ?? [];

  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const line1Street = [streetNumber, route].filter(Boolean).join(' ');

  const city =
    componentValue(components, 'locality') ||
    componentValue(components, 'postal_town') ||
    componentValue(components, 'sublocality') ||
    componentValue(components, 'administrative_area_level_2') ||
    '';

  const sublocality = componentValue(components, 'sublocality');
  const premise = componentValue(components, 'premise') || componentValue(components, 'neighborhood');

  const line1 = line1Street || premise || sublocality || city;
  const line2 = sublocality && sublocality !== line1 && sublocality !== city ? sublocality : '';

  return {
    line1,
    line2,
    city,
    postcode: componentValue(components, 'postal_code'),
    country: componentValue(components, 'country'),
    countryCode: componentValue(components, 'country', true).toUpperCase(),
  };
}

async function googleGeocode(params: Record<string, string>): Promise<GoogleGeocodeResponse> {
  const url = new URL(GOOGLE_GEOCODE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY!);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': env.DEFAULT_LOCALE },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Google geocode returned an HTTP error');
      throw ApiError.badGateway('Location provider is unavailable, please enter the address manually');
    }
    const body = (await res.json()) as GoogleGeocodeResponse;
    // Google reports auth/quota problems in the body with HTTP 200.
    if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT' || body.status === 'INVALID_REQUEST') {
      logger.warn({ status: body.status, error: body.error_message }, 'Google geocode rejected the request');
      throw ApiError.badGateway('Location provider is unavailable, please enter the address manually');
    }
    return body;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ err }, 'Google geocode failed');
    throw ApiError.badGateway(
      aborted
        ? 'Location lookup timed out, please enter the address manually'
        : 'Could not reach the location provider, please enter the address manually'
    );
  } finally {
    clearTimeout(timer);
  }
}

async function googleSearchAddresses(q: string, countryCode?: string): Promise<AddressSuggestion[]> {
  const params: Record<string, string> = { address: q };
  if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
    params.components = `country:${countryCode.toUpperCase()}`;
    params.region = countryCode.toLowerCase();
  }

  const body = await googleGeocode(params);
  if (body.status === 'ZERO_RESULTS') return [];

  return (body.results ?? [])
    .slice(0, 6)
    .map((result) => {
      const mapped = mapGoogleComponents(result);
      return { label: result.formatted_address ?? mapped.line1, ...mapped };
    })
    .filter((s) => !!s.line1 || !!s.label);
}

async function googleReverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const body = await googleGeocode({ latlng: `${lat},${lon}` });
  const result = body.results?.[0];
  if (!result || body.status === 'ZERO_RESULTS') {
    throw ApiError.notFound('No address found for that location');
  }

  const mapped = mapGoogleComponents(result);
  // Google's first result for a coordinate is a rooftop/street match — treat it
  // as exact. Coarser locality-only responses lack a street_number + route.
  const precision: ReverseGeocodeResult['precision'] = mapped.line1 && mapped.postcode ? 'exact' : 'approximate';

  return {
    line1: mapped.line1,
    city: mapped.city,
    postcode: precision === 'exact' ? mapped.postcode : '',
    country: mapped.country,
    countryCode: mapped.countryCode,
    precision,
  };
}
