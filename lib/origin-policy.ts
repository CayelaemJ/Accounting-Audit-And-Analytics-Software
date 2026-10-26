/**
 * Financial write operations must validate the complete browser Origin
 * (scheme + host + port), not merely the hostname.
 * Configure CABO_PUBLIC_ORIGIN for a strict production host allowlist.
 */
export class RequestOriginError extends Error {
  constructor() { super("Invalid request origin"); this.name = "RequestOriginError"; }
}
export function validSameOriginRequest(
  origin: string | null,
  host: string | null,
  production = false,
  configuredOrigin?: string
): boolean {
  if (!origin || !host || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(host)) return false;
  try {
    const browser = new URL(origin);
    // Real Origin headers contain no path, query, fragment or userinfo.
    if (browser.origin !== origin || browser.username || browser.password ||
        !["https:", "http:"].includes(browser.protocol)) return false;
    if (production && browser.protocol !== "https:") return false;
    if (browser.host.toLowerCase() !== host.toLowerCase()) return false;
    if (configuredOrigin) {
      const configured = new URL(configuredOrigin);
      if (configured.origin !== configuredOrigin || configured.host.toLowerCase() !== host.toLowerCase() ||
          configured.origin !== browser.origin) return false;
    }
    return true;
  } catch { return false; }
}
