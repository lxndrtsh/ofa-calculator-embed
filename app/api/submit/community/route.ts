import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getWebsiteUrl } from '../../utils/db';
import { sendToHubSpot } from '../../utils/hubspot';

interface CommunityFormData {
  city: string;
  state: string;
  county: string;
  population: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
}

interface SubmitBody {
  form: CommunityFormData;
  computed?: any; // Frontend computed values (for reference, but we'll recalculate)
  referralToken: string | null;
}

interface CountyData {
  YEAR: number;
  STATE: string;
  COUNTY_NAME: string;
  RATE_PER_100: number;
}

// Get config directly (same logic as config route)
function getConfig(formType: 'impact' | 'community') {
  return {
    version: 'dev',
    form: formType,
    labels: { impact_title: 'Impact Analysis', community_title: 'Return-on-Community' },
    math: {
      avg_dependents_per_employee: 2.5,
      rx_rate: 0.5,
      opioid_rx_rate: 0.2,
      at_risk_rate: 0.3,
      prescriber_non_cdc_rate: 0.9,
      avg_med_claim_usd: 4000
    }
  };
}

// Load county data directly from file
let countyDataCache: CountyData[] | null = null;
async function loadCountyData(): Promise<CountyData[]> {
  if (countyDataCache) {
    return countyDataCache;
  }
  
  try {
    const filePath = join(process.cwd(), 'app', 'data', 'counties-rate-list.json');
    const fileContents = await readFile(filePath, 'utf8');
    countyDataCache = JSON.parse(fileContents);
    return countyDataCache || [];
  } catch (error) {
    console.error('Failed to load county data:', error);
    return [];
  }
}

// Get county rate for a specific state + county
async function getCountyRate(state: string, county: string): Promise<number | null> {
  if (!state || !county || county === 'County Not Listed') {
    return null;
  }
  
  const data = await loadCountyData();
  const match = data.find(
    item => item.STATE === state && item.COUNTY_NAME === county
  );
  
  return match ? match.RATE_PER_100 : null;
}


export async function POST(req: Request) {
  try {
    const body: SubmitBody = await req.json();
    const { form, referralToken } = body;

    // Get config directly
    const config = getConfig('community');

    // Get county rate if state and county are provided
    const countyRate = await getCountyRate(form.state, form.county);

    // Perform calculations
    const population = Number(form.population || '0');
    const members = population;
    const withRx = Math.round(members * config.math.rx_rate);
    
    // Use county-specific opioid_rx_rate if available, otherwise use default
    // County rate is per 100, so divide by 100 to get the rate
    const opioidRxRate = countyRate !== null ? countyRate / 100 : config.math.opioid_rx_rate;
    const withORx = Math.round(withRx * opioidRxRate);
    const atRisk = Math.round(withORx * config.math.at_risk_rate);
    const prescribers = Math.round(atRisk * config.math.prescriber_non_cdc_rate);

    const calculatedResults = {
      members,
      withRx,
      withORx,
      atRisk,
      prescribers,
      opioidRxRate,
      countyRatePer100: countyRate,
      usedCountyRate: countyRate !== null,
    };

    // Send to HubSpot
    try {
      const hubspotResult = await sendToHubSpot({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        company: form.company,
        city: form.city,
        state: form.state,
        county: form.county,
        title: form.title,
        formType: 'community',
        population: form.population,
        calculatedResults,
        pdfUrl: null, // Community form doesn't generate PDFs yet
      });
      
      if (hubspotResult.success) {
        console.log(`HubSpot contact ${hubspotResult.contactId ? `(${hubspotResult.contactId})` : ''} processed successfully`);
      } else {
        console.error('HubSpot submission failed:', hubspotResult.error);
      }
    } catch (hubspotError) {
      // Log error but don't fail the submission if HubSpot call fails
      console.error('Failed to send to HubSpot:', hubspotError);
    }

    // TODO: Add Referral Tool integration here

    // Send data to external API
    const websiteUrl = getWebsiteUrl(req);
    try {
      const dbUrl = process.env.HPP_DB_URL;
      if (dbUrl) {
        await fetch(dbUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            formType: 'community',
            websiteUrl,
            form,
            results: calculatedResults,
            submittedAt: new Date().toISOString(),
          }),
        });
        console.log('Data sent to HPP_DB_URL successfully');
      } else {
        console.log('HPP_DB_URL not configured, skipping external API call');
      }
    } catch (dbError) {
      // Log error but don't fail the submission if external API call fails
      console.error('Failed to send data to external API:', dbError);
    }

    return NextResponse.json({
      ok: true,
      results: calculatedResults,
      message: 'Form submitted successfully',
    }, { status: 200 });
  } catch (error) {
    console.error('Submit error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Failed to submit form',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
