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
  formType: 'impact' | 'community';
  // Calculated results
  calculatedResults: any;
  // PDF URL (optional)
  pdfUrl?: string | null;
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
    if (data.company) contactProperties.company = data.company;
    if (data.city) contactProperties.city = data.city;
    if (data.state) contactProperties.state = data.state;
    if (data.title) contactProperties.jobtitle = data.title;

    // Add custom properties for form type
    // contactProperties.form_type = data.formType;
    contactProperties.calculator_form_type = data.formType;

    // Add form-specific input fields
    if (data.formType === 'impact') {
      if (data.employees) contactProperties.calculator_input_number_of_employees = data.employees;
      if (data.planMembers) contactProperties.calculator_input_number_of_plan_members = data.planMembers;
    } else if (data.formType === 'community') {
      if (data.population) contactProperties.calculator_input_county_population = data.population;
    }

    if (data.county) contactProperties.calculator_input_county = data.county;

    // Add calculated results as custom properties
    const results = data.calculatedResults;
    if (results) {
      if (results.members !== undefined) contactProperties.calculator_results_total_members = results.members;
      if (results.withRx !== undefined) contactProperties.calculator_results_rx_count = results.withRx;
      if (results.withORx !== undefined) contactProperties.calculator_results_orx_count = results.withORx;
      if (results.atRisk !== undefined) contactProperties.calculator_results_at_risk_count = results.atRisk;
      if (results.prescribers !== undefined) contactProperties.calculator_results_prescribers_identified = results.prescribers;
      
      // Impact-specific financial results
      if (data.formType === 'impact') {
        if (results.financialImpact !== undefined) contactProperties.calculator_results_financial_impact = results.financialImpact;
        if (results.targetedSavings !== undefined) contactProperties.calculator_results_targeted_savings = results.targetedSavings;
        if (results.targetedSavingsPercent !== undefined) contactProperties.calculator_results_targeted_savings_percentage = results.targetedSavingsPercent;
      }
      
      // Add math constants used
      if (results.opioidRxRate !== undefined) contactProperties.calculator_input_orx_rate = results.opioidRxRate;
      if (results.countyRatePer100 !== undefined && results.countyRatePer100 !== null) {
        contactProperties.calculator_input_county_rate_per_100 = results.countyRatePer100;
      }
    }

    // Add PDF URL if available
    if (data.pdfUrl) {
      contactProperties.calculator_result_pdf_url = data.pdfUrl;
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

