// Helper to get website URL from request
export function getWebsiteUrl(req: Request): string | null {
  // Try origin first (most reliable)
  const origin = req.headers.get('origin');
  if (origin) return origin;

  // Fall back to referer
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return referer;
    }
  }

  return null;
}
