import { NextResponse, type NextRequest } from "next/server"
export function proxy(request: NextRequest) {
  // UX shortcut only; the protected layout asks the API for the actual session.
  if (!request.cookies.has("sid")) {
    const url = new URL("/login", request.url)
    url.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    )
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] }
