# OFA Calculator Starter (Vercel)

Next.js (App Router) starter that hosts:
- **Embed iframe apps** at `/embed/impact` and `/embed/community`
- **API routes** under `/api/*`
- **UMD loader scripts** built into `public/cdn/leadcalc-*.min.js`

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000/demo
```

## Build

```bash
npm run build
# loaders emitted to public/cdn/*.js
```

## Deploy to Vercel

- Import repo to Vercel
- Set environment variables from `.env.local.sample`
- Deploy

## Client Embed Example

```html
<script src="https://YOUR_DOMAIN/cdn/leadcalc-impact.min.js"></script>
<div id="ofa-impact"></div>
<script>
  OFACalculator.init('ofa-impact', {
    apiBase: 'https://YOUR_DOMAIN',
    iframeBase: 'https://YOUR_DOMAIN',
    configVersion: '1.0.0',
    theme: 'light',
    referralCookie: 'referral'
  });
</script>
```

## TODO
- Implement GHL + Referral Tool calls in API routes using server-side secrets.
- Add origin checks in loaders once domain is finalized.
- Implement real population lookup (Census) and caching.
