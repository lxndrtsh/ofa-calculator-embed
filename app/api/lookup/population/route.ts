import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface PopulationData {
  State: string;
  Area_Name: string;
  Attribute: string;
  Value: number;
}

// Map state abbreviations to full names
const STATE_ABBREV_TO_NAME: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

let populationDataCache: PopulationData[] | null = null;

async function loadPopulationData(): Promise<PopulationData[]> {
  if (populationDataCache) {
    return populationDataCache;
  }
  
  try {
    const filePath = join(process.cwd(), 'app', 'data', 'county-population.json');
    const fileContents = await readFile(filePath, 'utf8');
    const raw = JSON.parse(fileContents) as PopulationData[];
    populationDataCache = (raw || []).filter(row => row.Attribute === 'POP_ESTIMATE_2023');
    return populationDataCache;
  } catch (error) {
    console.error('Failed to load population data:', error);
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stateAbbrev = searchParams.get('state') || '';
  const countyName = searchParams.get('county') || '';
  
  if (!stateAbbrev || !countyName || countyName === 'County Not Listed') {
    return NextResponse.json({ state: stateAbbrev, county: countyName, population: null });
  }
  
  try {
    const data = await loadPopulationData();
    const stateFullName = STATE_ABBREV_TO_NAME[stateAbbrev.toUpperCase()];
    
    if (!stateFullName) {
      console.warn(`Unknown state abbreviation: ${stateAbbrev}`);
      return NextResponse.json({ state: stateAbbrev, county: countyName, population: null });
    }
    
    // Normalize county name for matching (handles County, Borough, Parish, Municipality, etc.)
    const normalizeCountyName = (name: string): string => {
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s+(county|parish|borough|municipality|city)$/i, '')
        .trim();
    };
    
    const normalizedSearchCounty = normalizeCountyName(countyName);
    
    // Find the county entry matching state + county name (data is pre-filtered to POP_ESTIMATE_2023)
    const countyEntry = data.find(entry => {
      if (entry.State !== stateAbbrev.toUpperCase()) {
        return false;
      }
      const areaName = entry.Area_Name;
      const isCounty = /(County|Parish|Borough|Municipality|City)$/i.test(areaName);
      if (!isCounty) {
        return false;
      }
      const normalizedAreaName = normalizeCountyName(areaName);
      return normalizedAreaName === normalizedSearchCounty;
    });
    
    if (countyEntry) {
      return NextResponse.json({ 
        state: stateAbbrev, 
        county: countyName, 
        population: countyEntry.Value 
      });
    }
    
    console.warn(`Population not found for ${stateFullName}, ${countyName}`);
    return NextResponse.json({ state: stateAbbrev, county: countyName, population: null });
  } catch (error) {
    console.error('Population lookup error:', error);
    return NextResponse.json({ 
      state: stateAbbrev, 
      county: countyName, 
      population: null,
      error: 'Failed to lookup population'
    }, { status: 500 });
  }
}
