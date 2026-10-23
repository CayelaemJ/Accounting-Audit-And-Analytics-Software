import { NextRequest, NextResponse } from "next/server";

/**
 * Staging-only edge gate. Credentials live in Render environment variables, never Git.
 * Always leave /api/health available to the Render health checker.
 */
export async function middleware(request: NextRequest) {
  if (process.env.STAGING_MODE !== "true" || request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }
  const expected = process.env.STAGING_BASIC_AUTH;
  if (!expected || !expected.includes(":")) {
    return new NextResponse("Staging access has not been configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const deny = () => new NextResponse("Staging access requires authentication.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CABO Financial Intelligence Staging", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return deny();
  let candidate: string;
  try { candidate = atob(header.slice(6)); }
  catch { return deny(); }
  // Constant-time digest comparison prevents early exit on shared prefixes.
  const enc = new TextEncoder();
  const [expectedHash, candidateHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
    crypto.subtle.digest("SHA-256", enc.encode(candidate))
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(candidateHash);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0 ? NextResponse.next() : deny();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
