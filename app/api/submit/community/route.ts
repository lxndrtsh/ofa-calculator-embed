import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getWebsiteUrl } from '../../utils/db';
import { sendToHubSpot } from '../../utils/hubspot';
import { sendToReferralTool } from '../../utils/referralTool';
import { generateImpactPDFInitial, generateImpactPDFExpanded, generateImpactPDFFull } from '../../utils/pdfGenerator';
import { uploadToSpaces } from '../../utils/spacesUpload';

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
  hubspotIntegration?: boolean;
}

interface CountyData {
  YEAR: number;
  STATE: string;
  COUNTY_NAME: string;
  RATE_PER_100: number;
}

// Get config directly (same logic as config route)
function getConfig(formType: 'impact' | 'community') {
  if (formType === 'community') {
    return {
      version: 'dev',
      form: formType,
      labels: { impact_title: 'Impact Analysis', community_title: 'Return-on-Community' },
      math: {
        rx_rate: 0.5,
        opioid_rx_rate: 0.2,
        at_risk_rate: 0.3,
        prescriber_non_cdc_rate: 1.4,
        year2_decrease_rate: 0.24,
        year3_decrease_rate: 0.35,
        default_orx_per_100: 10.0
      }
    };
  }
  
  return {
    version: 'dev',
    form: formType,
    labels: { impact_title: 'Impact Analysis', community_title: 'Return-on-Community' },
    math: {
      avg_dependents_per_employee: 2.5,
      rx_rate: 0.5,
      opioid_rx_rate: 0.2,
      at_risk_rate: 0.3,
      prescriber_non_cdc_rate: 1.4,
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
    const { form, referralToken, hubspotIntegration } = body;

    // Get config directly
    const config = getConfig('community');

    // Get county rate if state and county are provided
    const countyRate = await getCountyRate(form.state, form.county);

    // Perform calculations
    const population = Number(form.population || '0');
    const members = population;
    const withRx = Math.round(members * config.math.rx_rate);
    
    // Calculate residents with opioid Rx
    // If county ORx/100 rate is available, use it directly on population
    // Otherwise, use default: 20% of residents with Rx
    let withORx: number;
    let orxPer100: number;
    let usedCountyRate: boolean;
    
    if (countyRate !== null) {
      // Use county-specific ORx/100 rate (per 100 population)
      orxPer100 = countyRate;
      const opioidRxRate = orxPer100 / 100; // Convert to decimal (e.g., 10.0 -> 0.10)
      withORx = Math.round(members * opioidRxRate);
      usedCountyRate = true;
    } else {
      // Default: 20% of residents with Rx
      const opioidRxRate = config.math.opioid_rx_rate; // 0.2 (20%)
      withORx = Math.round(withRx * opioidRxRate);
      // Calculate equivalent ORx/100 rate for display
      orxPer100 = (withORx / members) * 100;
      usedCountyRate = false;
    }
    
    const atRisk = Math.round(withORx * config.math.at_risk_rate);
    const prescribers = Math.round(atRisk * config.math.prescriber_non_cdc_rate);

    // Calculate milestones: Year 2 (24% decrease) and Year 3 (35% decrease) in ORx/100 rate
    const year2DecreaseRate = (config.math as any).year2_decrease_rate ?? 0.24;
    const year3DecreaseRate = (config.math as any).year3_decrease_rate ?? 0.35;
    const year2OrxPer100 = orxPer100 * (1 - year2DecreaseRate);
    const year3OrxPer100 = orxPer100 * (1 - year3DecreaseRate);
    
    const year2OrxRate = year2OrxPer100 / 100;
    const year3OrxRate = year3OrxPer100 / 100;
    
    // Calculate people with ORx at each milestone
    const year2WithORx = Math.round(members * year2OrxRate);
    const year3WithORx = Math.round(members * year3OrxRate);
    
    // Calculate people potentially saved (decrease in ORx cases)
    const year2PeopleSaved = withORx - year2WithORx;
    const year3PeopleSaved = withORx - year3WithORx;

    const calculatedResults = {
      members,
      withRx,
      withORx,
      atRisk,
      prescribers,
      opioidRxRate: orxPer100 / 100,
      orxPer100,
      countyRatePer100: countyRate,
      usedCountyRate,
      year2OrxPer100,
      year3OrxPer100,
      year2WithORx,
      year3WithORx,
      year2PeopleSaved,
      year3PeopleSaved,
      population, // Add population field
    };

    // Calculate Impact Analysis metrics (for HubSpot, not displayed in UI)
    // Use population as members for impact calculations
    let impactResults: any = null;
    try {
      const impactConfig = getConfig('impact');
      const impactMembers = population; // Use population as members
      const impactWithRx = Math.round(impactMembers * impactConfig.math.rx_rate);
      
      // Use county-specific opioid_rx_rate if available, otherwise use default
      const impactOpioidRxRate = countyRate !== null ? countyRate / 100 : impactConfig.math.opioid_rx_rate;
      const impactWithORx = Math.round(impactWithRx * impactOpioidRxRate);
      const impactAtRisk = Math.round(impactWithORx * impactConfig.math.at_risk_rate);
      const impactPrescribers = Math.round(impactAtRisk * impactConfig.math.prescriber_non_cdc_rate);

      // Financial calculations
      const costPerMemberORx = 7500;
      const netCostPerMemberORx = 4000;
      const avgCareManagedCost = 4500;
      const savingsPerMember = costPerMemberORx - avgCareManagedCost; // $3,000
      const financialImpact = impactWithORx * netCostPerMemberORx;
      const targetedSavings = impactWithORx * savingsPerMember;
      const targetedSavingsPercent = financialImpact > 0 ? Math.round((targetedSavings / financialImpact) * 100) : 0;

      impactResults = {
        members: impactMembers,
        withRx: impactWithRx,
        withORx: impactWithORx,
        atRisk: impactAtRisk,
        prescribers: impactPrescribers,
        avgClaim: impactConfig.math.avg_med_claim_usd,
        opioidRxRate: impactOpioidRxRate,
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
    } catch (error) {
      console.error('Failed to calculate impact results:', error);
      // Continue without impact results
    }

    // Generate and upload all 3 PDFs (initial, expanded, full)
    // All forms (full-oia, impact, community) generate the same PDFs:
    // - initial: Simplified view matching web results section
    // - expanded: Initial layout + all data points in copy:value format
    // - full: Complete data with both impact and community sections (when available)
    // Note: Community form uses impact PDF functions since impact results are always calculated
    const formDataForPDF = {
      company: form.company,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      state: form.state,
      county: form.county,
    };
    
    const timestamp = Date.now();
    const companySlug = form.company.replace(/[^a-zA-Z0-9]/g, '-');
    
    let pdfUrlInitial: string | null = null;
    let pdfUrlExpanded: string | null = null;
    let pdfUrlFull: string | null = null;
    
    // Generate Initial PDF (simplified) - use impact PDF function with impact results
    try {
      const pdfBufferInitial = await generateImpactPDFInitial(formDataForPDF, impactResults || {
        members: calculatedResults.members,
        withRx: calculatedResults.withRx,
        withORx: calculatedResults.withORx,
        atRisk: calculatedResults.atRisk,
        prescribers: calculatedResults.prescribers,
        costPerMemberORx: 7500,
        netCostPerMemberORx: 4000,
        avgCareManagedCost: 4500,
        savingsPerMember: 3000,
        financialImpact: calculatedResults.withORx * 4000,
        targetedSavings: calculatedResults.withORx * 3000,
        targetedSavingsPercent: 75,
      }, countyRate);
      const fileNameInitial = `community-report-${companySlug}-initial-${timestamp}.pdf`;
      const uploadResultInitial = await uploadToSpaces(pdfBufferInitial, fileNameInitial, 'application/pdf');
      pdfUrlInitial = uploadResultInitial.url;
      console.log('Initial PDF uploaded successfully:', pdfUrlInitial);
    } catch (error) {
      console.error('Failed to generate or upload Initial PDF:', error);
    }
    
    // Generate Expanded PDF (all data points) - use impact PDF function with impact results
    try {
      const pdfBufferExpanded = await generateImpactPDFExpanded(formDataForPDF, impactResults || {
        members: calculatedResults.members,
        withRx: calculatedResults.withRx,
        withORx: calculatedResults.withORx,
        atRisk: calculatedResults.atRisk,
        prescribers: calculatedResults.prescribers,
        costPerMemberORx: 7500,
        netCostPerMemberORx: 4000,
        avgCareManagedCost: 4500,
        savingsPerMember: 3000,
        financialImpact: calculatedResults.withORx * 4000,
        targetedSavings: calculatedResults.withORx * 3000,
        targetedSavingsPercent: 75,
      }, countyRate);
      const fileNameExpanded = `community-report-${companySlug}-expanded-${timestamp}.pdf`;
      const uploadResultExpanded = await uploadToSpaces(pdfBufferExpanded, fileNameExpanded, 'application/pdf');
      pdfUrlExpanded = uploadResultExpanded.url;
      console.log('Expanded PDF uploaded successfully:', pdfUrlExpanded);
    } catch (error) {
      console.error('Failed to generate or upload Expanded PDF:', error);
    }
    
    // Generate Full PDF (expanded + community data) - only if both impact and community results exist
    if (impactResults) {
      try {
        // Convert calculatedResults to CommunityResults format
        const communityResultsForPDF = {
          members: calculatedResults.members,
          withRx: calculatedResults.withRx,
          withORx: calculatedResults.withORx,
          atRisk: calculatedResults.atRisk,
          prescribers: calculatedResults.prescribers,
          orxPer100: calculatedResults.orxPer100,
          year2OrxPer100: calculatedResults.year2OrxPer100,
          year3OrxPer100: calculatedResults.year3OrxPer100,
          year2WithORx: calculatedResults.year2WithORx,
          year3WithORx: calculatedResults.year3WithORx,
          year2PeopleSaved: calculatedResults.year2PeopleSaved,
          year3PeopleSaved: calculatedResults.year3PeopleSaved,
          population: calculatedResults.population,
        };
        const pdfBufferFull = await generateImpactPDFFull(formDataForPDF, impactResults, communityResultsForPDF, countyRate);
        const fileNameFull = `community-report-${companySlug}-full-${timestamp}.pdf`;
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
          formType: 'community',
          population: form.population,
          calculatedResults, // Primary results (mapped to calculator_results_*)
          communityResults: calculatedResults, // Same data → calculator_community_* (was missing, caused low fill rate)
          impactResults, // Impact results (calculator_impact_*)
          pdfUrl: pdfUrl, // Legacy field (expanded PDF)
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

    // Send to Referral Tool (if referral code is valid)
    try {
      // Build metadata object with all form data, calculations, and results
      const metadata = {
        form_type: 'community',
        form_inputs: {
          city: form.city,
          state: form.state,
          county: form.county,
          population: form.population,
          company: form.company,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          title: form.title,
        },
        calculated_results: calculatedResults,
        impact_results: impactResults || null,
        pdf_urls: {
          pdfUrl: pdfUrl || null, // Legacy field
          pdfUrlInitial: pdfUrlInitial || null,
          pdfUrlExpanded: pdfUrlExpanded || null,
          pdfUrlFull: pdfUrlFull || null,
        },
      };

      const referralResult = await sendToReferralTool(req, referralToken, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        company: form.company,
        city: form.city,
        state: form.state,
        county: form.county,
        title: form.title,
      }, metadata);
      
      if (referralResult.success) {
        console.log('Referral tool: Lead sent successfully');
      } else {
        console.log('Referral tool: Skipped or failed', referralResult.error);
      }
    } catch (referralError) {
      // Log error but don't fail the submission if referral tool call fails
      console.error('Failed to send to referral tool:', referralError);
    }

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
