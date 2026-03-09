# 🔐 Security Architecture — Dating App

## Overview

Security is built into every layer of the stack — not bolted on afterwards. Every meaningful action a user takes is recorded, risk-scored, and available for review both by the user themselves and by platform admins.

---

## Security Layers

```
Request arrives
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  1. IP Blocker                                           │
│     Redis-cached list of blocked IPs. Blocks before     │
│     any route logic runs. Auto-blocks on bot detection.  │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  2. Security Context                                     │
│     Extracts real IP (Cloudflare CF-Connecting-IP),     │
│     User-Agent, device fingerprint (SHA-256 hash of     │
│     IP+UA+Accept-Language), and platform.               │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  3. Helmet (HTTP Security Headers)                       │
│     HSTS, CSP, X-Frame-Options, Referrer-Policy,        │
│     Permissions-Policy (disables camera/mic/geo by      │
│     default), X-Content-Type-Options.                   │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  4. Rate Limiting (Redis-backed)                         │
│     120 req/min global. Tighter per-endpoint limits:    │
│     - OTP request:  3 per 10 minutes                    │
│     - OTP verify:  10 per 10 minutes                    │
│     - Auth:        20 per 5 minutes                     │
│     All violations logged + risk-scored.                │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  5. JWT Auth Middleware (protected routes)               │
│     Verifies HS256 signature. Checks Redis blacklist.   │
│     Attaches userId + plan to request.                  │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  6. Route Handler                                        │
│     Business logic. Every sensitive action explicitly   │
│     calls logSecurityEvent() before returning.          │
└──────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│  7. Threat Analyser (async, non-blocking)               │
│     Runs after medium+ risk events. Detects patterns    │
│     like brute force, credential stuffing, bot activity.│
│     Auto-locks accounts + auto-blocks IPs if triggered. │
└──────────────────────────────────────────────────────────┘
```

---

## Authentication Security

### Phone OTP
- 6-digit code, valid for **2 minutes** only
- Code is **bcrypt-hashed** before storage (bcrypt rounds=12)
- Previous unused codes are **invalidated** when a new one is issued
- **Max 1 request per 2 minutes** per phone number (Redis TTL)
- **Max 5 verification attempts** before lockout
- After 3 failures in 15 minutes: phone locked for **30 minutes**

### JWT Tokens
| Token | Lifetime | Storage |
|---|---|---|
| Access token | 15 minutes | Memory only (never persisted) |
| Refresh token | 7 days | iOS Keychain / Android Keystore / `localStorage` (web) |

- **Rotation:** every refresh creates a new refresh token and revokes the old one
- **Blacklisting:** logout immediately blacklists the access token in Redis for its remaining TTL
- **Replay detection:** using a revoked refresh token triggers a `TOKEN_REVOKED` CRITICAL event

---

## Activity Logging

### What is logged

Every security-relevant action is recorded in the `SecurityEvent` table:

| Category | Events |
|---|---|
| **Authentication** | Login success/fail, OTP request/verify/fail/expire, logout, token refresh/revoke |
| **Sessions** | Created, expired, revoked, concurrent logins detected |
| **Account** | Locked, banned, phone/email changed, profile updated |
| **Access control** | Unauthorized access, forbidden resource, rate limit hit |
| **Payments** | Initiated, completed, failed, subscription changes |
| **Content** | Photos flagged, reports submitted, content removed |
| **Threats** | Brute force, bot activity, unusual location, multiple OTP failures |
| **GDPR** | Data export requested, account deletion requested |

### Risk Scoring (0–100)

Every event has a risk score used to prioritise alerts:

| Score | Severity | Examples |
|---|---|---|
| 0 | INFO | Successful login, logout, profile view |
| 1–25 | LOW | Single failed OTP, token refresh |
| 26–50 | MEDIUM | Rate limit hit, concurrent session |
| 51–75 | HIGH | Multiple failures, unauthorized access, device mismatch |
| 76–100 | CRITICAL | Brute force, bot activity, replay attacks |

### Automated Threat Detection

The threat analyser runs automatically after any event with risk ≥ 40 and checks for:

**Per user (15-minute window):**
- ≥ 3 failed OTPs → OTP locked for 30 minutes + HIGH event logged
- ≥ 5 failed logins → Account locked for 1 hour + CRITICAL event logged
- Activity from ≥ 3 different IPs → SUSPICIOUS_ACTIVITY event logged

**Per IP (15-minute window):**
- Targeting ≥ 10 different accounts OR ≥ 20 failed attempts → IP **auto-blocked for 24 hours** + BOT_ACTIVITY_DETECTED event logged

---

## Session Management

Every login creates a `DeviceSession` record with:
- Device name (parsed from User-Agent: "iPhone 15 Pro", "Chrome on Windows")
- Operating system
- Browser (if web)
- IP address
- Platform (ios / android / web)
- Timestamps

Users can see all their active sessions and **remotely revoke** any session they don't recognise — directly from the Security page on web or mobile.

---

## GDPR Compliance

Users can request:
- **Data export** — all their data packaged as a JSON file, delivered within 24 hours
- **Account deletion** — all data permanently deleted within 30 days

Both requests are logged as security events, stored in `DataRequest`, and are rate-limited to prevent abuse.

---

## Admin Security Dashboard

Available at `/admin/security` (web), the dashboard shows:
- Real-time event count, critical/high counts, blocked IPs, rate limit violations
- Events-over-time area chart (last 24 hours)
- Top threat types bar chart (last 7 days)
- Recent critical/high events with one-click resolve
- Live IP block management (add/remove with reason + duration)
- Per-user security audit (all events + sessions + risk profile)

---

## What's NOT done (future hardening)

These are the next steps for even higher security:

1. **E2E encrypted messages** — Signal Protocol via libsodium so even the server cannot read messages
2. **2FA fallback** — email TOTP as backup when phone is unavailable
3. **Certificate pinning** — prevent MITM on mobile apps
4. **Server-side request forgery (SSRF) protection** — validate all outbound URLs
5. **Webhook signature verification** — beyond PesaPal, verify all third-party webhooks with HMAC
6. **Admin role enforcement** — admin routes currently only check authentication; add a proper `isAdmin` flag
7. **Geo-IP anomaly scoring** — flag logins from countries the user has never logged in from
8. **Real-time push alerts** — send push notifications to users for HIGH/CRITICAL events on their account
