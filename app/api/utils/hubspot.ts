import * as hubspot from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts/models/Filter';

interface HubSpotContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  city?: string;
  state?: string;
  county?: string;
  title?: string;
  // Form-specific fields
  formType: 'impact' | 'community' | 'full-oia';
  // Calculated results
  calculatedResults: any;
  // Community results (for impact form that also calculates community metrics)
  communityResults?: any;
  // Impact results (for community form that also calculates impact metrics)
  impactResults?: any;
  // PDF URLs (optional)
  pdfUrl?: string | null;
  pdfUrlInitial?: string | null;
  pdfUrlExpanded?: string | null;
  pdfUrlFull?: string | null;
  // Additional form fields
  employees?: string;
  planMembers?: string;
  population?: string;
}

/**
 * Upserts a contact in HubSpot by email
 * Creates a new contact if not found, updates existing if found
 */
export async function sendToHubSpot(data: HubSpotContactData): Promise<{ success: boolean; contactId: string | null; error?: string }> {
  // console.log('Sending to HubSpot:', data);
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  console.log('HUBSPOT_ACCESS_TOKEN:', accessToken);
  if (!accessToken) {
    console.error('HUBSPOT_ACCESS_TOKEN is not set');
    return { success: false, contactId: null, error: 'HUBSPOT_ACCESS_TOKEN not configured' };
  }

  try {
    const hubspotClient = new hubspot.Client({ accessToken });

    // Prepare standard contact properties
    const contactProperties: Record<string, any> = {
      email: data.email,
    };

    if (data.firstName) contactProperties.firstname = data.firstName;
    if (data.lastName) contactProperties.lastname = data.lastName;
    if (data.phone) contactProperties.phone = data.phone;
    if (data.city) contactProperties.city = data.city;
    if (data.state) contactProperties.state = data.state;

    // Calculator-specific contact properties (not default company/jobtitle)
    if (data.company) contactProperties.calculator_input_company = data.company;
    if (data.title) contactProperties.calculator_input_jobtitle = data.title;

    // Add form type
    contactProperties.calculator_form_type = data.formType;

    // Add all input fields (store all regardless of form type)
    if (data.employees) contactProperties.calculator_input_number_of_employees = data.employees;
    if (data.planMembers) contactProperties.calculator_input_number_of_plan_members = data.planMembers;
    if (data.population) contactProperties.calculator_input_county_population = data.population;
    if (data.county) contactProperties.calculator_input_county = data.county;

    // Add calculated results (store all regardless of form type)
    const results = data.calculatedResults;
    if (results) {
      if (results.members !== undefined) contactProperties.calculator_results_total_members = results.members;
      if (results.withRx !== undefined) contactProperties.calculator_results_rx_count = results.withRx;
      if (results.withORx !== undefined) contactProperties.calculator_results_orx_count = results.withORx;
      if (results.atRisk !== undefined) contactProperties.calculator_results_at_risk_count = results.atRisk;
      if (results.prescribers !== undefined) contactProperties.calculator_results_prescribers_identified = results.prescribers;
      
      // Financial results (from Impact calculations)
      if (results.financialImpact !== undefined) contactProperties.calculator_results_financial_impact = results.financialImpact;
      if (results.targetedSavings !== undefined) contactProperties.calculator_results_targeted_savings = results.targetedSavings;
      if (results.targetedSavingsPercent !== undefined) contactProperties.calculator_results_targeted_savings_percentage = results.targetedSavingsPercent;
      
      // Math constants and rates
      if (results.opioidRxRate !== undefined) contactProperties.calculator_input_orx_rate = results.opioidRxRate;
      if (results.countyRatePer100 !== undefined && results.countyRatePer100 !== null) {
        contactProperties.calculator_input_county_rate_per_100 = results.countyRatePer100;
      }
      if (results.usedCountyRate !== undefined) contactProperties.calculator_input_used_county_rate = results.usedCountyRate;
      
      // Additional Impact-specific fields
      if (results.avgClaim !== undefined) contactProperties.calculator_results_avg_claim = results.avgClaim;
      if (results.costPerMemberORx !== undefined) contactProperties.calculator_results_cost_per_member_orx = results.costPerMemberORx;
      if (results.netCostPerMemberORx !== undefined) contactProperties.calculator_results_net_cost_per_member_orx = results.netCostPerMemberORx;
      if (results.avgCareManagedCost !== undefined) contactProperties.calculator_results_avg_care_managed_cost = results.avgCareManagedCost;
      if (results.savingsPerMember !== undefined) contactProperties.calculator_results_savings_per_member = results.savingsPerMember;
    }

    // Add community results if provided (calculated from county data)
    if (data.communityResults) {
      const community = data.communityResults;
      if (community.population !== undefined) contactProperties.calculator_community_county_population = community.population;
      if (community.members !== undefined) contactProperties.calculator_community_total_members = community.members;
      if (community.withRx !== undefined) contactProperties.calculator_community_rx_count = community.withRx;
      if (community.withORx !== undefined) contactProperties.calculator_community_orx_count = community.withORx;
      if (community.atRisk !== undefined) contactProperties.calculator_community_at_risk_count = community.atRisk;
      if (community.prescribers !== undefined) contactProperties.calculator_community_prescribers_identified = community.prescribers;
      if (community.orxPer100 !== undefined) contactProperties.calculator_community_orx_per_100 = community.orxPer100;
      if (community.year2OrxPer100 !== undefined) contactProperties.calculator_community_year2_orx_per_100 = community.year2OrxPer100;
      if (community.year3OrxPer100 !== undefined) contactProperties.calculator_community_year3_orx_per_100 = community.year3OrxPer100;
      if (community.year2WithORx !== undefined) contactProperties.calculator_community_year2_with_orx = community.year2WithORx;
      if (community.year3WithORx !== undefined) contactProperties.calculator_community_year3_with_orx = community.year3WithORx;
      if (community.year2PeopleSaved !== undefined) contactProperties.calculator_community_year2_people_saved = community.year2PeopleSaved;
      if (community.year3PeopleSaved !== undefined) contactProperties.calculator_community_year3_people_saved = community.year3PeopleSaved;
      if (community.usedCountyRate !== undefined) contactProperties.calculator_community_used_county_rate = community.usedCountyRate;
    }

    // Add impact results if provided (for community form that also calculates impact metrics)
    if (data.impactResults) {
      const impact = data.impactResults;
      // Map impact results to the same properties as calculatedResults
      if (impact.members !== undefined) contactProperties.calculator_impact_total_members = impact.members;
      if (impact.withRx !== undefined) contactProperties.calculator_impact_rx_count = impact.withRx;
      if (impact.withORx !== undefined) contactProperties.calculator_impact_orx_count = impact.withORx;
      if (impact.atRisk !== undefined) contactProperties.calculator_impact_at_risk_count = impact.atRisk;
      if (impact.prescribers !== undefined) contactProperties.calculator_impact_prescribers_identified = impact.prescribers;
      
      // Financial results
      if (impact.financialImpact !== undefined) contactProperties.calculator_impact_financial_impact = impact.financialImpact;
      if (impact.targetedSavings !== undefined) contactProperties.calculator_impact_targeted_savings = impact.targetedSavings;
      if (impact.targetedSavingsPercent !== undefined) contactProperties.calculator_impact_targeted_savings_percentage = impact.targetedSavingsPercent;
      
      // Math constants and rates
      if (impact.opioidRxRate !== undefined) contactProperties.calculator_impact_orx_rate = impact.opioidRxRate;
      if (impact.countyRatePer100 !== undefined && impact.countyRatePer100 !== null) {
        contactProperties.calculator_impact_county_rate_per_100 = impact.countyRatePer100;
      }
      if (impact.usedCountyRate !== undefined) contactProperties.calculator_impact_used_county_rate = impact.usedCountyRate;
      
      // Additional Impact-specific fields
      if (impact.avgClaim !== undefined) contactProperties.calculator_impact_avg_claim = impact.avgClaim;
      if (impact.costPerMemberORx !== undefined) contactProperties.calculator_impact_cost_per_member_orx = impact.costPerMemberORx;
      if (impact.netCostPerMemberORx !== undefined) contactProperties.calculator_impact_net_cost_per_member_orx = impact.netCostPerMemberORx;
      if (impact.avgCareManagedCost !== undefined) contactProperties.calculator_impact_avg_care_managed_cost = impact.avgCareManagedCost;
      if (impact.savingsPerMember !== undefined) contactProperties.calculator_impact_savings_per_member = impact.savingsPerMember;
    }

    // Add PDF URLs if available
    if (data.pdfUrl) {
      contactProperties.calculator_result_pdf_url = data.pdfUrl; // Legacy field for backward compatibility
    }
    if (data.pdfUrlInitial) {
      contactProperties.calculator_result_pdf_url_initial = data.pdfUrlInitial;
    }
    if (data.pdfUrlExpanded) {
      contactProperties.calculator_result_pdf_url_expanded = data.pdfUrlExpanded;
    }
    if (data.pdfUrlFull) {
      contactProperties.calculator_result_pdf_url_full = data.pdfUrlFull;
    }

    // Try to find existing contact by email
    let contactId: string | null = null;
    try {
      const searchRequest = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: FilterOperatorEnum.Eq,
                value: data.email,
              },
            ],
          },
        ],
        properties: ['email'],
        limit: 1,
        after: "0",
      };

      const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch(searchRequest);
      
      if (searchResponse.results && searchResponse.results.length > 0) {
        contactId = searchResponse.results[0].id;
      }
    } catch (searchError) {
      // If search fails, we'll create a new contact
      console.log('Contact search failed, will create new contact:', searchError);
    }

    // Create or update contact
    if (contactId) {
      // Update existing contact
      const updateRequest = {
        properties: contactProperties,
      };
      
      await hubspotClient.crm.contacts.basicApi.update(contactId, updateRequest);
      console.log(`Updated HubSpot contact ${contactId} for ${data.email}`);
    } else {
      // Create new contact
      const createRequest = {
        properties: contactProperties,
      };
      
      const createResponse = await hubspotClient.crm.contacts.basicApi.create(createRequest);
      contactId = createResponse.id;
      console.log(`Created HubSpot contact ${contactId} for ${data.email}`);
    }

    return { success: true, contactId };
  } catch (error) {
    console.error('HubSpot API error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, contactId: null, error: errorMessage };
  }
}

