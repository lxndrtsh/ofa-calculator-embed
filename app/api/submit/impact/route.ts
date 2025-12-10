import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getWebsiteUrl } from '../../utils/db';
import { generateImpactPDF } from '../../utils/pdfGenerator';
import { uploadToSpaces } from '../../utils/spacesUpload';
import { sendToHubSpot } from '../../utils/hubspot';

interface ImpactFormData {
  employees: string;
  planMembers: string;
  company: string;
  city: string;
  state: string;
  county: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
}

interface SubmitBody {
  form: ImpactFormData;
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
    const config = getConfig('impact');

    // Get county rate if state and county are provided
    const countyRate = await getCountyRate(form.state, form.county);

    // Perform calculations
    const employees = Number(form.employees || '0');
    const planMembersInput = Number(form.planMembers || '0');
    // If planMembers is provided, use it directly; otherwise calculate from employees
    const members = planMembersInput > 0 ? planMembersInput : Math.round(employees * config.math.avg_dependents_per_employee);
    const withRx = Math.round(members * config.math.rx_rate);
    
    // Use county-specific opioid_rx_rate if available, otherwise use default
    // County rate is per 100, so divide by 100 to get the rate
    const opioidRxRate = countyRate !== null ? countyRate / 100 : config.math.opioid_rx_rate;
    const withORx = Math.round(withRx * opioidRxRate);
    const atRisk = Math.round(withORx * config.math.at_risk_rate);
    const prescribers = Math.round(atRisk * config.math.prescriber_non_cdc_rate);

    // Financial calculations
    const costPerMemberORx = 7500;
    const netCostPerMemberORx = 4000;
    const avgCareManagedCost = 4500;
    const savingsPerMember = costPerMemberORx - avgCareManagedCost; // $3,000
    const financialImpact = withORx * netCostPerMemberORx;
    const targetedSavings = withORx * savingsPerMember;
    const targetedSavingsPercent = financialImpact > 0 ? Math.round((targetedSavings / financialImpact) * 100) : 0;

    const calculatedResults = {
      members,
      withRx,
      withORx,
      atRisk,
      prescribers,
      avgClaim: config.math.avg_med_claim_usd,
      opioidRxRate,
      countyRatePer100: countyRate,
      usedCountyRate: countyRate !== null,
      // Financial calculations
      costPerMemberORx,
      netCostPerMemberORx,
      avgCareManagedCost,
      savingsPerMember,
      financialImpact,
      targetedSavings,
      targetedSavingsPercent,
    };

    // Generate and upload PDF first (needed for HubSpot)
    let pdfUrl: string | null = null;
    try {
      const pdfBuffer = await generateImpactPDF(
        {
          company: form.company,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
        },
        calculatedResults
      );

      const fileName = `impact-report-${form.company.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
      const uploadResult = await uploadToSpaces(pdfBuffer, fileName, 'application/pdf');
      pdfUrl = uploadResult.url;
      console.log('PDF uploaded successfully:', pdfUrl);
    } catch (pdfError) {
      // Log error but don't fail the submission if PDF generation/upload fails
      console.error('Failed to generate or upload PDF:', pdfError);
      if (pdfError instanceof Error) {
        console.error('Error details:', {
          message: pdfError.message,
          stack: pdfError.stack,
          endpoint: process.env.DO_SPACES_ENDPOINT,
          bucket: process.env.DO_SPACES_BUCKET,
        });
      }
    }

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
        formType: 'impact',
        employees: form.employees,
        planMembers: form.planMembers,
        calculatedResults,
        pdfUrl,
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
            formType: 'impact',
            websiteUrl,
            form,
            results: calculatedResults,
            pdfUrl: pdfUrl || null,
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
      pdfUrl: pdfUrl, // Include PDF URL in response if generated successfully
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
