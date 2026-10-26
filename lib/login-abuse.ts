/**
 * Database-backed attempt limit identity.
 * Deliberately not based on X-Forwarded-For/X-Real-IP: requests can spoof those
 * values unless a specific trusted ingress chain is independently verified.
 * lib/http.ts SHA-256 hashes this key before storing it.
 */
export function loginAttemptKey(identifier: string): string {
  return "login:account:" + identifier.trim().toLowerCase();
}
