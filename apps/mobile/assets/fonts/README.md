# Font Setup

Download the following fonts and place them in `apps/mobile/assets/fonts/`:

## Required fonts

### Geist (by Vercel — free, open source)
Download from: https://vercel.com/font/geist
- `Geist-Regular.ttf`
- `Geist-Medium.ttf`
- `Geist-SemiBold.ttf`
- `Geist-Bold.ttf`

### Geist Mono (by Vercel — free, open source)
Download from: https://vercel.com/font/geist
- `GeistMono-Regular.ttf`

### Playfair Display (Google Fonts — free, open source)
Download from: https://fonts.google.com/specimen/Playfair+Display
- `PlayfairDisplay-Regular.ttf`
- `PlayfairDisplay-Bold.ttf`

## After placing fonts

Run:
```bash
cd apps/mobile
npx expo prebuild --clean    # regenerates native projects with font config
```

## Web app

The web app uses the `geist` npm package (already in package.json) and
loads Playfair Display via `next/font/google`. No manual font files needed.

## Development fallback

If fonts aren't available during development, the app falls back to:
- `system-ui` for sans-serif
- `monospace` for mono
- `serif` for display

The app will still work — just without custom typography.
