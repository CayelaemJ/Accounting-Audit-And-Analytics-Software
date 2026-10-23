import {NextRequest,NextResponse} from "next/server";
/**
 * Public marketing routes and application-owned authentication.
 * No additional HTTP Basic gate: the browser must never be asked to authenticate
 * twice just to reach the homepage. Protected dashboard/API routes continue to
 * authenticate and authorise using the server-side CABO session.
 */
export function middleware(_request:NextRequest){
 return NextResponse.next();
}
