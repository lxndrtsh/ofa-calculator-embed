// US States list with abbreviations
export const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'District of Columbia' },
];

export interface CountyData {
  YEAR: number;
  STATE: string;
  COUNTY_NAME: string;
  RATE_PER_100: number;
}

let countyDataCache: CountyData[] | null = null;

// Load county data once and cache it
export async function loadCountyData(apiBase?: string): Promise<CountyData[]> {
  if (countyDataCache) {
    console.log('Using cached county data, count:', countyDataCache.length);
    return countyDataCache;
  }
  
  try {
    const base = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = `${base}/api/data/counties`;
    console.log('Loading county data from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Failed to load county data:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    console.log('Loaded county data, count:', Array.isArray(data) ? data.length : 'not an array', data);
    countyDataCache = data;
    return data;
  } catch (error) {
    console.error('Failed to load county data:', error);
    return [];
  }
}

// Get counties for a specific state
export async function getCountiesForState(state: string, apiBase?: string): Promise<Array<{ value: string; label: string }>> {
  console.log('getCountiesForState called with:', { state, apiBase });
  if (!state) {
    console.log('No state provided, returning empty array');
    return [];
  }
  
  const data = await loadCountyData(apiBase);
  console.log('County data loaded, filtering for state:', state, 'Total records:', data.length);
  
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('County data is empty or not an array');
    return [];
  }
  
  // Debug: show first few records to check structure
  if (data.length > 0) {
    console.log('Sample county record:', data[0]);
    console.log('Sample STATE value:', data[0]?.STATE, 'Looking for:', state);
  }
  
  const counties = data
    .filter(item => {
      const matches = item.STATE === state;
      if (!matches && data.indexOf(item) < 5) {
        console.log('Non-matching record:', item.STATE, 'vs', state);
      }
      return matches;
    })
    .map(item => ({
      value: item.COUNTY_NAME,
      label: item.COUNTY_NAME
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  
  console.log('Filtered counties for', state, ':', counties.length, counties.slice(0, 3));
  return counties;
}

// Get ORx rate for a specific state + county combination
export async function getCountyRate(state: string, county: string, apiBase?: string): Promise<number | null> {
  if (!state || !county || county === 'County Not Listed') {
    return null;
  }
  
  const data = await loadCountyData(apiBase);
  const match = data.find(
    item => item.STATE === state && item.COUNTY_NAME === county
  );
  
  return match ? match.RATE_PER_100 : null;
}

// Convert RATE_PER_100 to opioid_rx_rate (divide by 100)
export function convertRateToOpioidRxRate(ratePer100: number | null): number | null {
  if (ratePer100 === null) return null;
  return ratePer100 / 100;
}

