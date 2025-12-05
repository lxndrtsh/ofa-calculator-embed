import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

let countyDataCache: any = null;

export async function GET() {
  console.log('API route /api/data/counties called');
  
  if (countyDataCache) {
    console.log('Returning cached county data, count:', Array.isArray(countyDataCache) ? countyDataCache.length : 'not an array');
    return NextResponse.json(countyDataCache, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    const filePath = join(process.cwd(), 'app', 'data', 'counties-rate-list.json');
    console.log('Reading county data from:', filePath);
    const fileContents = await readFile(filePath, 'utf8');
    countyDataCache = JSON.parse(fileContents);
    console.log('Loaded county data, count:', Array.isArray(countyDataCache) ? countyDataCache.length : 'not an array');
    if (Array.isArray(countyDataCache) && countyDataCache.length > 0) {
      console.log('Sample record:', countyDataCache[0]);
    }
    
    return NextResponse.json(countyDataCache, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to load county data:', error);
    return NextResponse.json({ error: 'Failed to load county data', details: String(error) }, { status: 500 });
  }
}

