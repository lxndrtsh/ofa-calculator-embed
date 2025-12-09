import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { saveCommunitySubmission, getWebsiteUrl } from '../../utils/db';
// Get config directly (same logic as config route)
function getConfig(formType) {
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
let countyDataCache = null;
async function loadCountyData() {
    if (countyDataCache) {
        return countyDataCache;
    }
    try {
        const filePath = join(process.cwd(), 'app', 'data', 'counties-rate-list.json');
        const fileContents = await readFile(filePath, 'utf8');
        countyDataCache = JSON.parse(fileContents);
        return countyDataCache || [];
    }
    catch (error) {
        console.error('Failed to load county data:', error);
        return [];
    }
}
// Get county rate for a specific state + county
async function getCountyRate(state, county) {
    if (!state || !county || county === 'County Not Listed') {
        return null;
    }
    const data = await loadCountyData();
    const match = data.find(item => item.STATE === state && item.COUNTY_NAME === county);
    return match ? match.RATE_PER_100 : null;
}
// Stub for HubSpot API call
async function sendToHubSpot(formData, calculatedResults) {
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
export async function POST(req) {
    try {
        const body = await req.json();
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
        // Send to HubSpot (stub for now)
        await sendToHubSpot(form, calculatedResults);
        // TODO: Add Referral Tool integration here
        // Save to database
        const websiteUrl = getWebsiteUrl(req);
        await saveCommunitySubmission(websiteUrl, form, calculatedResults);
        return NextResponse.json({
            ok: true,
            results: calculatedResults,
            message: 'Form submitted successfully',
        }, { status: 200 });
    }
    catch (error) {
        console.error('Submit error:', error);
        return NextResponse.json({
            ok: false,
            error: 'Failed to submit form',
            details: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
//# sourceMappingURL=route.js.map