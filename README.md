# Dating App

> East Africa's dating app — Uganda, Kenya, Tanzania.  
> React Native (iOS + Android) · Next.js web · Fastify API · Prisma 7 · Postgres

---

## What's inside

| App / Package | Description |
|---|---|
| `apps/mobile` | Expo 54 iOS + Android app |
| `apps/web` | Next.js 15 web app |
| `apps/api` | Fastify 5 REST + WebSocket API |
| `packages/db` | Prisma 7 schema + generated client |
| `packages/types` | Shared TypeScript types |
| `packages/config` | Shared ESLint + TypeScript config |

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 — `npm install -g pnpm`
- **Expo CLI** — `npm install -g expo-cli`
- **EAS CLI** (for native builds) — `npm install -g eas-cli`

---

## Getting started

```bash
# 1. Clone and install
git clone https://github.com/your-org/dating-app.git
cd dating-app
pnpm install

# 2. Set up environment variables (see Environment section below)

# 3. Generate Prisma client
pnpm db:generate

# 4. Run database migrations
pnpm --filter @dating/db db:migrate

# 5. Start everything
pnpm dev
```

`pnpm dev` starts all three apps concurrently via Turborepo:
- API → `http://localhost:4000`
- Web → `http://localhost:3000`
- Mobile → Expo Metro bundler with QR code

---

## Running apps individually

```bash
# API only
pnpm --filter @dating/api dev

# Web only
pnpm --filter @dating/web dev

# Mobile only
pnpm --filter @dating/mobile dev
```

For the mobile app on a physical device, set your machine's local IP in `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000
```

---

## Environment variables

### `apps/api/.env`

```env
# Database (Prisma Postgres)
DATABASE_URL="prisma+postgres://..."

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="your-secret-here"
JWT_REFRESH_SECRET="your-refresh-secret-here"

# Africa's Talking (SMS OTP)
AT_API_KEY="your-key"
AT_USERNAME="your-username"
AT_SENDER_ID="DatingApp"

# Redis (Upstash)
REDIS_URL="rediss://..."
REDIS_TOKEN="your-token"

# Cloudflare R2 (media storage)
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-key"
R2_SECRET_ACCESS_KEY="your-secret"
R2_BUCKET_NAME="dating-media"
R2_PUBLIC_URL="https://media.yourdomain.com"

# LiveKit (video/voice calls)
LIVEKIT_URL="wss://your-livekit-server"
LIVEKIT_API_KEY="your-key"
LIVEKIT_API_SECRET="your-secret"

# OpenAI (embeddings + moderation)
OPENAI_API_KEY="sk-..."

# PesaPal (payments)
PESAPAL_CONSUMER_KEY="your-key"
PESAPAL_CONSUMER_SECRET="your-secret"
PESAPAL_IPN_URL="https://api.yourdomain.com/webhooks/pesapal"
PESAPAL_ENV="sandbox"   # or "production"

# App
NODE_ENV="development"
PORT=4000
CORS_ORIGINS="http://localhost:3000,exp://..."
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_WS_URL="ws://localhost:4000"
```

### `apps/mobile/.env.local`

```env
EXPO_PUBLIC_API_URL="http://192.168.x.x:4000"
EXPO_PUBLIC_WS_URL="ws://192.168.x.x:4000"
```

### `packages/db/.env`

```env
DATABASE_URL="prisma+postgres://..."
```

---

## Database

Powered by **Prisma 7** + **Prisma Postgres** (cloud) with `pgvector` for AI-based matching.

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create and apply a new migration
pnpm --filter @dating/db db:migrate

# Open Prisma Studio (visual DB browser)
pnpm db:studio

# Reset database (drops all data — dev only)
pnpm --filter @dating/db exec prisma migrate reset
```

> **Note:** PostGIS is not used. Location is stored as plain `latitude` / `longitude` Float fields. Distance calculations use the Haversine formula in application code.

---

## Mobile builds

The app runs in **Expo Go** during development (no custom native build needed).

### Expo Go (development)

```bash
pnpm --filter @dating/mobile dev
# Scan the QR code with Expo Go on your phone
```

### Native builds via EAS

```bash
# Development build (Expo Dev Client)
eas build --profile development --platform all

# Preview build (internal testing APK/IPA)
eas build --profile preview --platform all

# Production build (App Store / Play Store)
eas build --profile production --platform all
```

### Adding fonts (required before production)

System fonts are used as fallback until you add the TTF files:

1. Download **Geist** from [github.com/vercel/geist-font](https://github.com/vercel/geist-font/releases)
2. Download **Playfair Display** from [fonts.google.com](https://fonts.google.com/specimen/Playfair+Display)
3. Place in `apps/mobile/assets/fonts/`:
   ```
   Geist-Regular.ttf
   Geist-Medium.ttf
   Geist-SemiBold.ttf
   Geist-Bold.ttf
   GeistMono-Regular.ttf
   PlayfairDisplay-Regular.ttf
   PlayfairDisplay-Bold.ttf
   ```
4. Restore the `useFonts()` call in `apps/mobile/app/_layout.tsx`

---

## Auth flow

Phone-number OTP via Africa's Talking. No passwords.

```
New user:    Welcome → Phone + country → SMS OTP → Onboarding (6 steps) → Discover
Returning:   App open → token refresh from SecureStore → Discover (no login screen)
Re-auth:     Token expired → Welcome → Phone + OTP → Discover (skips onboarding)
```

Supported countries: 🇺🇬 Uganda (+256) · 🇰🇪 Kenya (+254) · 🇹🇿 Tanzania (+255)

---

## Mobile screens

| Route | Screen |
|---|---|
| `/(auth)/welcome` | Landing page |
| `/(auth)/phone` | Phone number + OTP verification |
| `/(auth)/onboarding` | 6-step profile setup (new users only) |
| `/(tabs)/discover` | Swipe card deck |
| `/(tabs)/matches` | Match list |
| `/(tabs)/chat` | Conversation list |
| `/(tabs)/profile` | Edit profile |
| `/chat/[matchId]` | Direct message thread |
| `/call/[matchId]` | LiveKit video/voice call |
| `/payments` | Subscription management |
| `/security` | Activity log + device sessions |

---

## API routes

| Method | Route | Description |
|---|---|---|
| POST | `/auth/otp/request` | Send SMS OTP |
| POST | `/auth/otp/verify` | Verify OTP, return tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |
| GET/POST | `/profiles` | Get / update profile |
| POST | `/profiles/onboarding` | Complete new user onboarding |
| GET | `/matches` | List matches |
| POST | `/matches/:id/swipe` | Like / pass / super like |
| GET/POST | `/messages/:matchId` | Get / send messages |
| POST | `/calls/:matchId` | Create LiveKit call token |
| POST | `/payments/create-order` | Create PesaPal order |
| POST | `/webhooks/pesapal` | PesaPal IPN webhook |
| GET | `/security/events` | Activity log |
| GET | `/security/devices` | Active device sessions |
| DELETE | `/security/devices/:id` | Revoke device session |
| * | `/admin/*` | Admin dashboard routes |

---

## Payments

Powered by **PesaPal v3**. No card data touches our servers.

| Country | Methods |
|---|---|
| 🇺🇬 Uganda | MTN Mobile Money, Airtel Money, Visa/Mastercard |
| 🇰🇪 Kenya | M-Pesa, Visa/Mastercard |

Plans: **Gold** · **Platinum** · One-time boosts · Super Likes

Webhook security: HMAC-SHA256 signature verified before any subscription is activated.

---

## Security

Every request passes through a 7-layer pipeline:

```
Cloudflare WAF → IP Blocker → Security Context → Helmet headers
→ Rate Limiter → Auth Guard (JWT RS256) → Route Handler
```

- **60+ event types** logged with risk scores (0–100)
- Automated threat detection: brute force, bot activity, credential stuffing
- Device session tracking with remote revocation
- IP auto-block (24hr) on bot detection
- GDPR-compliant: data export + account deletion queued via BullMQ

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | Expo 54 · React Native 0.81.5 · Expo Router v6 · NativeWind v5 |
| Web | Next.js 15 · Tailwind CSS v4 · TypeScript 5.9 |
| API | Fastify 5 · Node.js 22 · Zod · TypeScript 5.9 |
| Database | Prisma 7 · Prisma Postgres · pgvector |
| Real-time | Socket.io · LiveKit (WebRTC) |
| Cache / Queue | Upstash Redis · BullMQ |
| Auth | JWT RS256 · Africa's Talking OTP · SecureStore |
| Payments | PesaPal API v3 |
| AI | OpenAI ada-002 embeddings · pgvector cosine similarity |
| Storage | Cloudflare R2 · Cloudflare Stream |
| CDN / Edge | Cloudflare WAF + CDN |
| Monorepo | Turborepo · pnpm workspaces |

---

## Project structure

```
dating-app/
├── apps/
│   ├── mobile/          # Expo app
│   ├── web/             # Next.js app
│   └── api/             # Fastify API
├── packages/
│   ├── db/              # Prisma schema + client
│   ├── types/           # Shared TypeScript types
│   └── config/          # ESLint + TSConfig
├── package.json         # Root scripts + pnpm overrides
└── turbo.json
```

---

## Contributing

1. Branch from `main`
2. Run `pnpm lint` and `pnpm type-check` before opening a PR
3. Never commit `.env` files, `android/`, `ios/`, or signing keys — all gitignored
4. Migrations go through PR review before `prisma migrate deploy` runs in production

---

*Built for East Africa · Kampala, Uganda*