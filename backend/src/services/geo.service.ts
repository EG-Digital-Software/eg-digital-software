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
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
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

const TIMEOUT_MS = 8000;

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

  let payload: { address?: NominatimAddress; error?: string };
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

  return {
    line1: [a.house_number, a.road].filter(Boolean).join(' '),
    // Providers label the locality differently by country — take the first hit.
    city: a.city || a.town || a.village || a.municipality || a.city_district || a.suburb || a.county || '',
    postcode: a.postcode ?? '',
    country: a.country ?? '',
    countryCode: (a.country_code ?? '').toUpperCase(),
  };
}
