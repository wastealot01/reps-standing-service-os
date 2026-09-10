# REPS Standing — Service OS

Tracks hours toward Real Estate Professional Status (IRC §469) for XSITE Capital
investors. Built on the same stack as WasteALot, so it deploys the same way.

## Stack

| Layer | Tech |
|---|---|
| Language | TypeScript 5.6 (Node 22.x) |
| Web server | Express 4 |
| Frontend | Vanilla JS PWA, no framework, served from `/public` |
| Database | Managed PostgreSQL 16 via `pg` |
| Auth | Self-hosted JWT + bcrypt (no third-party auth provider) |
| Validation | Zod |

## Deploy — same pattern as WasteALot

1. Push this folder to a new GitHub repo, e.g. `xsitecapital/reps-standing-service-os`
2. In Render: **New → Blueprint**, point it at that repo. Render reads `render.yaml`
   and provisions both the web service and the managed Postgres database in one shot,
   `JWT_SECRET` is auto-generated, `DATABASE_URL` is wired automatically.
3. First deploy runs `npm run migrate` before `npm start`, so the schema is created
   automatically. No manual SQL step needed.
4. Once live, Render gives you a URL like `reps-standing-service-os.onrender.com`.
   Point a real subdomain at it later, e.g. `reps.xsitecapital.com`, via a CNAME.

## Local development

```
cp .env.example .env
# fill in a local DATABASE_URL (a local Postgres instance, or a Render dev database)
npm install
npm run build
npm run migrate
npm run dev
```

## How accounts work

A household is the unit, not an individual login. The first person to sign up
becomes the `primary` account and creates the household; they get an invite code
to hand to their spouse. The spouse redeems that code to create their own `spouse`
account in the same household. Each account has entirely separate log entries and
dashboard numbers, only properties are shared across the household. This is
deliberate: IRC §469(c)(7)(B) requires each spouse to independently clear both
tests, so their hours must never be combined or averaged.

## What's intentionally NOT in v1

- File attachments — the evidence field is a text reference only (a calendar invite
  title, an email subject). Real photo/document upload would need object storage
  (S3 or R2) added later, same scaling note WasteALot's own spec calls out for uploads.
- Email (password reset, invite delivery) — `RESEND_API_KEY` is stubbed in
  `.env.example` for when this gets added; for now the invite code is just shown
  on screen after signup.
- MFA — WasteALot uses TOTP for certain roles; not needed for this app's threat
  model yet, but the pattern is there to copy if it ever is.
- Outlook add-in (Phase 2) — this repo is the web app only.

## Compliance note

The activity checklist in `src/categories.ts` is grounded in IRC §469(c)(7)(C) but
has **not yet been reviewed by XSITE's CPA or tax counsel**. Treat it as a strong
draft, not a final legal artifact, until that review happens.
