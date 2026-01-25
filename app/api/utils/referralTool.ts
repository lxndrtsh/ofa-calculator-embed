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
  country: string;
  job_title: string;
}

interface ReferralPayload {
  code: string;
  ip_address: string;
  user_agent: string;
  action: 'lead';
  customer: ReferralCustomer;
  metadata?: any; // Full dataset: form inputs, calculations, results, PDF URLs, etc.
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
 * Cleans up IPv6-mapped IPv4 addresses (removes ::ffff: prefix)
 */
function getIpAddress(req: Request): string {
  // Check x-forwarded-for header (most common in proxies/load balancers)
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    const firstIp = ips[0] || '';
    // Remove IPv6-mapped IPv4 prefix (::ffff:)
    return firstIp.replace(/^::ffff:/i, '') || 'unknown';
  }

  // Check x-real-ip header
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    // Remove IPv6-mapped IPv4 prefix (::ffff:)
    return realIp.replace(/^::ffff:/i, '');
  }

  // Fallback to 'unknown' if we can't determine IP
  // Note: In Next.js API routes, we don't have direct access to connection.remoteAddress
  return 'unknown';
}

/**
 * Gets user agent from request headers
 * Checks multiple possible header names to ensure we get the browser's user agent
 */
function getUserAgent(req: Request): string {
  // Try standard user-agent header first
  const userAgent = req.headers.get('user-agent');
  if (userAgent && userAgent.toLowerCase() !== 'node') {
    return userAgent;
  }

  // Try alternative header names (some proxies might use different names)
  const altUserAgent = req.headers.get('user-agent') || 
                       req.headers.get('x-user-agent') ||
                       req.headers.get('x-forwarded-user-agent');
  
  if (altUserAgent && altUserAgent.toLowerCase() !== 'node') {
    return altUserAgent;
  }

  // If we only got 'node', return unknown (don't send Node.js user agent)
  return 'unknown';
}

/**
 * Sends lead data to the referral tool API
 * Returns success status and logs errors without throwing
 * @param metadata - Optional full dataset including form inputs, calculations, results, PDF URLs, etc.
 */
export async function sendToReferralTool(
  req: Request,
  referralCode: string | null | undefined,
  formData: ReferralFormData,
  metadata?: any
): Promise<{ success: boolean; error?: string }> {
  console.log('Referral tool: Called with referralCode:', referralCode, 'type:', typeof referralCode);
  
  // Validate referral code
  if (!isValidReferralCode(referralCode)) {
    console.log('Referral tool: Skipping - invalid or missing referral code. Code was:', JSON.stringify(referralCode));
    return { success: false, error: 'Invalid referral code' };
  }

  // Hardcode URL for debugging (matching working example)
  const apiUrl = 'https://portal.highperformancehealthplans.com/hooks/referral-lead';
  console.log('Referral tool: Using hardcoded URL:', apiUrl);

  // Get IP address and user agent
  const ipAddress = getIpAddress(req);
  const userAgent = getUserAgent(req);
  
  // Debug logging
  console.log('Referral tool: Raw IP from headers:', req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip'));
  console.log('Referral tool: Cleaned IP address:', ipAddress);
  console.log('Referral tool: Raw user-agent header:', req.headers.get('user-agent'));
  console.log('Referral tool: Cleaned user agent:', userAgent);

  // Build customer object
  // Note: address uses city value since address field is not collected in forms
  // zip is NOT included - we don't collect it, so don't send it at all
  // All fields explicitly cast to string to ensure API validation passes
  const customer: ReferralCustomer = {
    first_name: String(formData.firstName || ''),
    last_name: String(formData.lastName || ''),
    email: String(formData.email || ''),
    phone: String(formData.phone || ''),
    address: String(formData.city || ''), // Use city as address (forms don't collect separate address field)
    city: String(formData.city || ''),
    state: String(formData.state || ''),
    country: String('US'), // Static as per requirements
    job_title: String(formData.title || ''),
  };

  // Build payload - ensure all fields are strings
  const payload: ReferralPayload = {
    code: String(referralCode!.trim()),
    ip_address: String(ipAddress),
    user_agent: String(userAgent),
    action: 'lead',
    customer,
  };

  // Add metadata if provided (full dataset for storage)
  if (metadata) {
    payload.metadata = metadata;
  }

  console.log('Referral tool: ====== ABOUT TO MAKE FETCH CALL ======');
  console.log('Referral tool: URL:', apiUrl);
  console.log('Referral tool: Payload:', JSON.stringify(payload, null, 2));
  console.log('Referral tool: Payload keys:', Object.keys(payload));
  console.log('Referral tool: Customer keys:', Object.keys(payload.customer));

  // Make API call with timeout - matching working example (no Bearer token, simple headers)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    console.log('Referral tool: Fetch call starting NOW...');
    const fetchPromise = fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent, // Use the same user agent from the payload in the header
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    console.log('Referral tool: Fetch promise created, awaiting response...');
    const response = await fetchPromise;

    clearTimeout(timeoutId);

    console.log('Referral tool: ====== FETCH RESPONSE RECEIVED ======');
    console.log('Referral tool: Response status:', response.status, response.statusText);
    console.log('Referral tool: Response ok?', response.ok);
    // Log response headers (convert Headers to object)
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log('Referral tool: Response headers:', responseHeaders);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Referral tool API error: ${response.status} ${response.statusText}`);
      console.error('Referral tool: Error response body:', errorText);
      return { success: false, error: `API returned ${response.status}` };
    }

    const responseText = await response.text().catch(() => '');
    console.log('Referral tool: Success response body:', responseText);
    console.log(`Referral tool: Successfully sent lead for referral code: ${referralCode}`);
    return { success: true };
  } catch (error) {
    console.error('Referral tool: ====== FETCH ERROR CAUGHT ======');
    console.error('Referral tool: Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Referral tool: Error name:', error instanceof Error ? error.name : 'N/A');
    console.error('Referral tool: Error message:', error instanceof Error ? error.message : String(error));
    console.error('Referral tool: Full error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Referral tool: Request timeout after 5 seconds');
      return { success: false, error: 'Request timeout' };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
