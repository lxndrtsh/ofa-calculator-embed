import { NextResponse } from 'next/server';

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

// Stub for HubSpot API call
async function sendToHubSpot(formData: CommunityFormData, calculatedResults: any) {
  // TODO: Implement HubSpot API integration
  // This will send contact data and custom properties to HubSpot
  console.log('HubSpot stub - would send:', {
    email: formData.email,
    firstName: formData.firstName,
    lastName: formData.lastName,
    company: formData.company,
    // ... all form fields and calculated results
  });
  return { success: true, contactId: null };
}

export async function POST(req: Request) {
  try {
    const body: SubmitBody = await req.json();
    const { form, referralToken } = body;

    // Get config - fetch from same origin
    const origin = req.headers.get('origin') || req.headers.get('host') || 'localhost:3000';
    const protocol = origin.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${origin.replace(/^https?:\/\//, '')}`;
    const configResponse = await fetch(`${baseUrl}/api/config?version=dev&form=community`);
    const config = await configResponse.json();

    // Get county rate if state and county are provided
    let countyRate: number | null = null;
    if (form.state && form.county && form.county !== 'County Not Listed') {
      try {
        const countyDataResponse = await fetch(`${baseUrl}/api/data/counties`);
        const countyData = await countyDataResponse.json();
        const match = countyData.find(
          (item: any) => item.STATE === form.state && item.COUNTY_NAME === form.county
        );
        if (match) {
          countyRate = match.RATE_PER_100;
        }
      } catch (error) {
        console.error('Error loading county data:', error);
      }
    }

    // Perform calculations
    const population = Number(form.population || '0');
    const members = population;
    const withRx = Math.round(members * config.math.rx_rate);
    
    // Use county-specific opioid_rx_rate if available, otherwise use default
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

    // Send to HubSpot (stub for now)
    await sendToHubSpot(form, calculatedResults);

    // TODO: Add Referral Tool integration here

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
    }, { status: 500 });
  }
}
