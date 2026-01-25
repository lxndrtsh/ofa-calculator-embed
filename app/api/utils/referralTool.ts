/**
 * Referral Tool API Integration
 * Sends lead data to the referral tool when a valid referral code is provided
 */

interface ReferralCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  job_title: string;
}

interface ReferralPayload {
  code: string;
  ip_address: string;
  user_agent: string;
  action: 'lead';
  customer: ReferralCustomer;
}

interface ReferralFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  city?: string;
  state?: string;
  county?: string;
  title?: string;
}

/**
 * Validates if a referral code should trigger the API call
 * Returns false if code is null, undefined, blank string, or the example 'referral' string
 */
function isValidReferralCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const trimmed = code.trim();
  if (trimmed === '') return false;
  if (trimmed.toLowerCase() === 'referral') return false;
  return true;
}

/**
 * Gets IP address from request headers
 * Checks x-forwarded-for, x-real-ip, and falls back to connection info
 */
function getIpAddress(req: Request): string {
  // Check x-forwarded-for header (most common in proxies/load balancers)
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0] || 'unknown';
  }

  // Check x-real-ip header
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to 'unknown' if we can't determine IP
  // Note: In Next.js API routes, we don't have direct access to connection.remoteAddress
  return 'unknown';
}

/**
 * Gets user agent from request headers
 */
function getUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'unknown';
}

/**
 * Sends lead data to the referral tool API
 * Returns success status and logs errors without throwing
 */
export async function sendToReferralTool(
  req: Request,
  referralCode: string | null | undefined,
  formData: ReferralFormData
): Promise<{ success: boolean; error?: string }> {
  // Validate referral code
  if (!isValidReferralCode(referralCode)) {
    console.log('Referral tool: Skipping - invalid or missing referral code');
    return { success: false, error: 'Invalid referral code' };
  }

  // Check for required environment variables
  const apiUrl = process.env.REFERRAL_TOOL_API_URL;
  const apiKey = process.env.REFERRAL_TOOL_API_KEY;

  if (!apiUrl || !apiKey) {
    console.warn('Referral tool: Missing REFERRAL_TOOL_API_URL or REFERRAL_TOOL_API_KEY');
    return { success: false, error: 'Referral tool not configured' };
  }

  // Get IP address and user agent
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);

  // Build customer object
  const customer: ReferralCustomer = {
    first_name: formData.firstName || '',
    last_name: formData.lastName || '',
    email: formData.email || '',
    phone: formData.phone || '',
    address: '', // Not collected in forms
    city: formData.city || '',
    state: formData.state || '',
    zip: '', // Not collected in forms
    country: 'US', // Static as per requirements
    job_title: formData.title || '',
  };

  // Build payload
  const payload: ReferralPayload = {
    code: referralCode!.trim(),
    ip_address: ipAddress,
    user_agent: userAgent,
    action: 'lead',
    customer,
  };

  // Make API call with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Referral tool API error: ${response.status} ${response.statusText}`, errorText);
      return { success: false, error: `API returned ${response.status}` };
    }

    console.log(`Referral tool: Successfully sent lead for referral code: ${referralCode}`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Referral tool: Request timeout after 5 seconds');
      return { success: false, error: 'Request timeout' };
    }
    console.error('Referral tool: Failed to send lead', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
