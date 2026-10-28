# CABO Financial — Cloudflare Workers migration assessment

## Current application
- Runtime: Next.js 15 App Router, React 19, PostgreSQL (`pg`), `next start`.
- Existing Render branch: `feature/cabo-financial-intelligence-foundation`.
- Target: a Workers-compatible **server-rendered** full-stack app. A static-only Pages deployment would break authentication, database-backed finance reports, bank imports and secure operations.
- No DNS, database, wallet, subscription or banking provider cutover has been performed.

## Official Cloudflare guidance as of 28 Oct 2026
Cloudflare recommends `vinext` for new Next.js Worker migrations, but it is beta and its one-step `vinext init` guidance is written for existing Next.js 16. Current app is Next.js 15; do not blindly change its framework. OpenNext is an alternative for existing Next.js apps. Reference:
https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/

## Next actions
1. Run `npx vinext check` on a clean build with no sensitive environment variables; capture compatibility findings.
2. Choose between targeted Next 16 upgrade + vinext, OpenNext Cloudflare, or retaining a separate API backend while moving only marketing/static pages.
3. Test session encryption/cookie scope, CSRF, origin controls, banking import, uploads, Postgres connectivity and rate limiting on Workers; avoid real banking details.
4. Benchmark Workers Free CPU and request limits to avoid surprise hard limits; don't claim a totally free production finance SaaS is guaranteed.
5. Only then create a Cloudflare Workers deployment through a narrowly scoped API token or the connected Cloudflare API. **No Cloudflare-GitHub App connection required.**

## Explicit exclusions
**NewChanges is not part of this migration and must remain on Render.** Other existing Render services remain intact until replacement testing succeeds.
