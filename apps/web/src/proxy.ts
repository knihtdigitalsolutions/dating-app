import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// ─── 1. Static Configuration (Allocated once at boot, not per request) ───────
const ROLE_HIERARCHY: Record<string, number> = {
  USER: 1,
  PREMIUM: 2,
  MODERATOR: 3,
  ADMIN: 4,
};

const ROUTE_ROLE_REQUIREMENTS = [
  { prefix: "/api/admin",     minRole: "ADMIN" },
  { prefix: "/admin",         minRole: "ADMIN" },
  { prefix: "/api/moderator", minRole: "MODERATOR" },
  { prefix: "/moderator",     minRole: "MODERATOR" },
  { prefix: "/api/premium",   minRole: "PREMIUM" },
  { prefix: "/premium",       minRole: "PREMIUM" },
];

const CSP_HEADER_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", 
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", 
  "font-src 'self'",
  "connect-src 'self' https://api.africastalking.com",
  "frame-src 'none'",
].join("; ");

const JWT_ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'super-secret-access-key'
)

function hasRequiredRole(userRole: string | undefined, minRole: string): boolean {
  const currentRole = userRole || 'USER';
  return (ROLE_HIERARCHY[currentRole] ?? 1) >= (ROLE_HIERARCHY[minRole] ?? 99);
}

// ─── 2. Next.js 16 Native Proxy Function Named Export ───────────────────────
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🚨 CRITICAL FIX: Bypass token validation for public pages & auth endpoints to break the loop
  if (
    pathname === '/login' || 
    pathname === '/403' || 
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  // 1. Resolve Auth Context (Adapts for Mobile Bearer Headers or Web Cookies)
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    token = req.cookies.get('accessToken')?.value || null;
  }

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    // 2. High-Speed Cryptographic Signature Check
    const { payload } = await jwtVerify(token, JWT_ACCESS_SECRET);
    
    if (payload.status === 'BANNED' || payload.error === 'ACCOUNT_INVALID') {
      const response = NextResponse.redirect(new URL('/login?error=SessionExpired', req.url));
      response.cookies.delete('accessToken');
      return response;
    }

    const userRole = (payload.role as string) || 'USER';

    // 3. Optimized String Prefix RBAC Enforcement
    for (const { prefix, minRole } of ROUTE_ROLE_REQUIREMENTS) {
      if (pathname.startsWith(prefix)) {
        if (!hasRequiredRole(userRole, minRole)) {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Forbidden: Insufficient Permissions' }, { status: 403 });
          }
          return NextResponse.redirect(new URL('/403', req.url));
        }
        break; 
      }
    }

    // 4. Inject Security Headers on Validated Streams
    const res = NextResponse.next();
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    res.headers.set("Content-Security-Policy", CSP_HEADER_VALUE);

    return res;

  } catch (jwtError) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session signature invalid' }, { status: 401 });
    }
    const failResponse = NextResponse.redirect(new URL('/login?error=InvalidSession', req.url));
    failResponse.cookies.delete('accessToken');
    return failResponse;
  }
}

// ─── 3. Next.js 16 Statically Analyzed Matcher ──────────────────────────────
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};