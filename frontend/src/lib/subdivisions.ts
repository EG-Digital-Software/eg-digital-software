// State / province / region lists per country, keyed by ISO-3166 alpha-2.
//
// `value` is what we persist on the address (kept consistent with how the ABN
// autofill writes it — e.g. Australian states are abbreviations like "VIC").
// `label` is what the operator sees. Countries not listed here fall back to a
// free-text State input, so every address in the world still works.

export interface Subdivision {
  value: string;
  label: string;
}

const SUBDIVISIONS: Record<string, Subdivision[]> = {
  // Australia — abbreviations, matching the ABR/CreditorWatch autofill.
  AU: [
    { value: 'ACT', label: 'Australian Capital Territory (ACT)' },
    { value: 'NSW', label: 'New South Wales (NSW)' },
    { value: 'NT', label: 'Northern Territory (NT)' },
    { value: 'QLD', label: 'Queensland (QLD)' },
    { value: 'SA', label: 'South Australia (SA)' },
    { value: 'TAS', label: 'Tasmania (TAS)' },
    { value: 'VIC', label: 'Victoria (VIC)' },
    { value: 'WA', label: 'Western Australia (WA)' },
  ],

  // United States — USPS two-letter codes.
  US: [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
    ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
    ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
    ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
    ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
    ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
    ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
    ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
    ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
    ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
    ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
    ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
    ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ].map(([value, label]) => ({ value, label: `${label} (${value})` })),

  // Canada — provinces and territories.
  CA: [
    ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
    ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
    ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
    ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
  ].map(([value, label]) => ({ value, label: `${label} (${value})` })),

  // New Zealand — regions.
  NZ: [
    'Auckland', 'Bay of Plenty', 'Canterbury', 'Gisborne', "Hawke's Bay", 'Manawatu-Whanganui',
    'Marlborough', 'Nelson', 'Northland', 'Otago', 'Southland', 'Taranaki', 'Tasman',
    'Waikato', 'Wellington', 'West Coast',
  ].map((name) => ({ value: name, label: name })),

  // United Kingdom — the four nations.
  GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'].map((name) => ({
    value: name,
    label: name,
  })),

  // India — states and union territories.
  IN: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal',
    // Union territories
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ].map((name) => ({ value: name, label: name })),
};

/** Subdivisions for a country code, or [] when we don't maintain a list. */
export function subdivisionsOf(countryCode?: string | null): Subdivision[] {
  return (countryCode && SUBDIVISIONS[countryCode.toUpperCase()]) || [];
}

/** Whether a country has a defined state/region list (so we show a dropdown). */
export function hasSubdivisions(countryCode?: string | null): boolean {
  return subdivisionsOf(countryCode).length > 0;
}
