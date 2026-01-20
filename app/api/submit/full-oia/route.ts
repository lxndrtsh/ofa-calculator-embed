import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getWebsiteUrl } from '../../utils/db';
import { generateImpactPDFInitial, generateImpactPDFExpanded, generateImpactPDFFull } from '../../utils/pdfGenerator';
import { uploadToSpaces } from '../../utils/spacesUpload';
import { sendToHubSpot } from '../../utils/hubspot';

interface PopulationData {
  Area_Name: string;
  Attribute: string;
  Value: number;
}

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
  computed?: any;
  referralToken: string | null;
  hubspotIntegration?: boolean;
}

interface CountyData {
  YEAR: number;
  STATE: string;
  COUNTY_NAME: string;
  RATE_PER_100: number;
}

// Get config directly (same logic as config route)
function getConfig(formType: 'impact' | 'community' | 'full-oia') {
  if (formType === 'community') {
    return {
      version: 'dev',
      form: formType,
      labels: { impact_title: 'Impact Analysis', community_title: 'Return-on-Community' },
      math: {
        rx_rate: 0.5,
        opioid_rx_rate: 0.2,
        at_risk_rate: 0.3,
        prescriber_non_cdc_rate: 0.9,
        year2_decrease_rate: 0.24,
        year3_decrease_rate: 0.35,
        default_orx_per_100: 10.0
      }
    };
  }
  
  // Both 'impact' and 'full-oia' use the same math config
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

// Load population data
let populationDataCache: PopulationData[] | null = null;
async function loadPopulationData(): Promise<PopulationData[]> {
  if (populationDataCache) {
    return populationDataCache;
  }
  
  try {
    const filePath = join(process.cwd(), 'app', 'data', 'county-population.json');
    const fileContents = await readFile(filePath, 'utf8');
    populationDataCache = JSON.parse(fileContents);
    return populationDataCache || [];
  } catch (error) {
    console.error('Failed to load population data:', error);
    return [];
  }
}

// Get county population
async function getCountyPopulation(state: string, county: string): Promise<number | null> {
  if (!state || !county || county === 'County Not Listed') {
    return null;
  }
  
  try {
    const data = await loadPopulationData();
    const stateFullName = STATE_ABBREV_TO_NAME[state.toUpperCase()];
    
    if (!stateFullName) {
      console.warn(`Unknown state abbreviation: ${state}`);
      return null;
    }
    
    // Normalize county name for matching
    const normalizeCountyName = (name: string): string => {
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s+(county|parish|borough|municipality|city)$/i, '')
        .trim();
    };
    
    const normalizedSearchCounty = normalizeCountyName(county);
    
    const countyEntry = data.find(entry => {
      const areaName = entry.Area_Name;
      const isCounty = /(County|Parish|Borough|Municipality|City)$/i.test(areaName);
      if (!isCounty) return false;
      if (entry.Attribute !== 'POP_ESTIMATE_2023') return false;
      const normalizedAreaName = normalizeCountyName(areaName);
      return normalizedAreaName === normalizedSearchCounty;
    });
    
    return countyEntry ? countyEntry.Value : null;
  } catch (error) {
    console.error('Failed to get county population:', error);
    return null;
  }
}


export async function POST(req: Request) {
  try {
    const body: SubmitBody = await req.json();
    const { form, referralToken, hubspotIntegration } = body;

    // Get config directly
    const config = getConfig('full-oia');

    // Get county rate if state and county are provided
    const countyRate = await getCountyRate(form.state, form.county);

    // Perform calculations
    const employees = Number(form.employees || '0');
    const planMembersInput = Number(form.planMembers || '0');
    // If planMembers is provided, use it directly; otherwise calculate from employees
    const members = planMembersInput > 0 ? planMembersInput : Math.round(employees * (config.math.avg_dependents_per_employee ?? 2.5));
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

    // Calculate Return on Community metrics (for HubSpot, not displayed in UI)
    let communityResults: any = null;
    if (form.state && form.county && form.county !== 'County Not Listed') {
      try {
        const communityConfig = getConfig('community');
        const countyPopulation = await getCountyPopulation(form.state, form.county);
        
        if (countyPopulation && countyPopulation > 0) {
          const communityMembers = countyPopulation;
          const communityWithRx = Math.round(communityMembers * communityConfig.math.rx_rate);
          
          // Calculate residents with opioid Rx
          let communityWithORx: number;
          let communityOrxPer100: number;
          let communityUsedCountyRate: boolean;
          
          if (countyRate !== null) {
            // Use county-specific ORx/100 rate (per 100 population)
            communityOrxPer100 = countyRate;
            const communityOpioidRxRate = communityOrxPer100 / 100;
            communityWithORx = Math.round(communityMembers * communityOpioidRxRate);
            communityUsedCountyRate = true;
          } else {
            // Default: 20% of residents with Rx
            const communityOpioidRxRate = communityConfig.math.opioid_rx_rate;
            communityWithORx = Math.round(communityWithRx * communityOpioidRxRate);
            communityOrxPer100 = (communityWithORx / communityMembers) * 100;
            communityUsedCountyRate = false;
          }
          
          const communityAtRisk = Math.round(communityWithORx * communityConfig.math.at_risk_rate);
          const communityPrescribers = Math.round(communityAtRisk * communityConfig.math.prescriber_non_cdc_rate);
          
          // Calculate milestones: Year 2 (24% decrease) and Year 3 (35% decrease) in ORx/100 rate
          const year2OrxPer100 = communityOrxPer100 * (1 - (communityConfig.math.year2_decrease_rate ?? 0.24));
          const year3OrxPer100 = communityOrxPer100 * (1 - (communityConfig.math.year3_decrease_rate ?? 0.35));
          
          const year2OrxRate = year2OrxPer100 / 100;
          const year3OrxRate = year3OrxPer100 / 100;
          
          // Calculate people with ORx at each milestone
          const year2WithORx = Math.round(communityMembers * year2OrxRate);
          const year3WithORx = Math.round(communityMembers * year3OrxRate);
          
          // Calculate people potentially saved (decrease in ORx cases)
          const year2PeopleSaved = communityWithORx - year2WithORx;
          const year3PeopleSaved = communityWithORx - year3WithORx;
          
          communityResults = {
            members: communityMembers,
            withRx: communityWithRx,
            withORx: communityWithORx,
            atRisk: communityAtRisk,
            prescribers: communityPrescribers,
            opioidRxRate: communityOrxPer100 / 100,
            orxPer100: communityOrxPer100,
            countyRatePer100: countyRate,
            usedCountyRate: communityUsedCountyRate,
            year2OrxPer100,
            year3OrxPer100,
            year2WithORx,
            year3WithORx,
            year2PeopleSaved,
            year3PeopleSaved,
            population: countyPopulation,
          };
        }
      } catch (error) {
        console.error('Failed to calculate community results:', error);
        // Continue without community results
      }
    }

    // Generate and upload all 3 PDFs (initial, expanded, full)
    const formDataForPDF = {
      company: form.company,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    };
    
    const timestamp = Date.now();
    const companySlug = form.company.replace(/[^a-zA-Z0-9]/g, '-');
    
    let pdfUrlInitial: string | null = null;
    let pdfUrlExpanded: string | null = null;
    let pdfUrlFull: string | null = null;
    
    // Generate Initial PDF (simplified)
    try {
      const pdfBufferInitial = await generateImpactPDFInitial(formDataForPDF, calculatedResults);
      const fileNameInitial = `full-oia-report-${companySlug}-initial-${timestamp}.pdf`;
      const uploadResultInitial = await uploadToSpaces(pdfBufferInitial, fileNameInitial, 'application/pdf');
      pdfUrlInitial = uploadResultInitial.url;
      console.log('Initial PDF uploaded successfully:', pdfUrlInitial);
    } catch (error) {
      console.error('Failed to generate or upload Initial PDF:', error);
    }
    
    // Generate Expanded PDF (all Impact data points)
    try {
      const pdfBufferExpanded = await generateImpactPDFExpanded(formDataForPDF, calculatedResults);
      const fileNameExpanded = `full-oia-report-${companySlug}-expanded-${timestamp}.pdf`;
      const uploadResultExpanded = await uploadToSpaces(pdfBufferExpanded, fileNameExpanded, 'application/pdf');
      pdfUrlExpanded = uploadResultExpanded.url;
      console.log('Expanded PDF uploaded successfully:', pdfUrlExpanded);
    } catch (error) {
      console.error('Failed to generate or upload Expanded PDF:', error);
    }
    
    // Generate Full PDF (expanded + community data) - only if community results exist
    if (communityResults) {
      try {
        const pdfBufferFull = await generateImpactPDFFull(formDataForPDF, calculatedResults, communityResults);
        const fileNameFull = `full-oia-report-${companySlug}-full-${timestamp}.pdf`;
        const uploadResultFull = await uploadToSpaces(pdfBufferFull, fileNameFull, 'application/pdf');
        pdfUrlFull = uploadResultFull.url;
        console.log('Full PDF uploaded successfully:', pdfUrlFull);
      } catch (error) {
        console.error('Failed to generate or upload Full PDF:', error);
      }
    }
    
    // Legacy pdfUrl for backward compatibility (use expanded as default)
    const pdfUrl = pdfUrlExpanded;

    // Send to HubSpot (only if hubspotIntegration is explicitly true)
    if (hubspotIntegration === true) {
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
          formType: 'full-oia',
          employees: form.employees,
          planMembers: form.planMembers,
          calculatedResults,
          communityResults, // Include community calculations for HubSpot
          pdfUrl, // Legacy field (expanded PDF)
          pdfUrlInitial,
          pdfUrlExpanded,
          pdfUrlFull,
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
    } else {
      console.log('HubSpot integration disabled for this submission');
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
            formType: 'full-oia',
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
      pdfUrl: pdfUrl, // Legacy field (expanded PDF)
      pdfUrlInitial: pdfUrlInitial,
      pdfUrlExpanded: pdfUrlExpanded,
      pdfUrlFull: pdfUrlFull,
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
