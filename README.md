# Foodini

Recipes, weekly meal plans and grocery lists. See `docs/superpowers/specs/` for the design.

## Local development

Requires Node 22, pnpm and Docker.

```bash
pnpm install
pnpm exec supabase start        # local Postgres, Auth, Storage, Mailpit
cp .env.example .env.local      # then fill in keys from `pnpm exec supabase status` and your email in ALLOWED_EMAILS
pnpm db:migrate
pnpm dev
```

Sign-in emails arrive in Mailpit at http://127.0.0.1:54324.
After `pnpm exec supabase db reset`, run `pnpm db:migrate` again.

If another app is already using port 3000, run Foodini on another port and tell it so. The port must also be listed in `additional_redirect_urls` in `supabase/config.toml`, or sign-in links won't redirect:

```bash
SITE_URL=http://localhost:3001 pnpm dev --port 3001
```

### Stopping

Stop things in reverse order of startup:

1. Stop the dev server with `Ctrl+C` in its terminal. Let any `pnpm test:e2e` run finish; Playwright stops its own server.
2. Stop local Supabase. Your data (users, recipes, photos) is kept for next time:
   ```bash
   pnpm exec supabase stop
   ```
   To wipe the local data instead, use `pnpm exec supabase stop --no-backup`, then run `pnpm db:migrate` after the next `supabase start`.
3. Quit Docker Desktop if nothing else needs it. Stop Supabase first, so its containers shut down cleanly.

To start again: open Docker Desktop, run `pnpm exec supabase start`, then `pnpm dev`.

## Tests

```bash
pnpm test        # unit tests (lib/)
pnpm test:int    # database + row-level security (needs local Supabase)
pnpm test:e2e    # Playwright (needs local Supabase; runs its own server on port 3100)
pnpm test:e2e:sw # service worker, against a production build (slow; port 3200)
```

## Deploying

Foodini runs on any Next.js host; these steps assume **Vercel** plus a **hosted Supabase** project.

1. **Supabase project.** Create one, then open **Connect** and copy two connection strings:
   - **Session pooler** (port 5432): for migrations. The transaction pooler doesn't support the prepared statements migrations use.
   - **Transaction pooler** (port 6543): for the running app (`db/index.ts` already disables prepared statements for it).
2. **Migrate** (tables, row-level security and the photo bucket):
   ```bash
   DATABASE_URL="<session pooler URL>" pnpm db:migrate
   ```
3. **Auth → URL Configuration:** set the Site URL to your domain and add `https://<your-domain>/**` to the redirect URLs.
4. **Auth → Email Templates:** set both **Magic Link** and **Confirm signup** to the body of `supabase/templates/magic-link.html`. Supabase's built-in email is heavily rate-limited, so configure custom SMTP (Resend, Postmark, …) for reliable sign-in links.
5. **Host environment** (Vercel → Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Settings → API)
   - `DATABASE_URL`: the **transaction pooler** URL
   - `SITE_URL`: `https://<your-domain>`
   - `ALLOWED_EMAILS`: the addresses allowed to sign in

   Do not set `SUPABASE_SECRET_KEY`, `IMPORT_ALLOW_PRIVATE` or `NEXT_DIST_DIR` in production.
6. **Deploy,** sign in once, then turn off Auth → Sign In / Providers → **Allow new users to sign up**. The app also rejects sessions for addresses not in `ALLOWED_EMAILS`, but this stops strangers from creating accounts at all.

After deploying, run later migrations the same way as step 2, before or alongside the deploy that needs them.

## License

Copyright © 2026 Jesse Gansler. All rights reserved.

Foodini is proprietary and has no open-source license yet: the code may not be copied, modified or redistributed without permission. Dependencies are under their own (mostly permissive) licenses, and recipes imported from other websites remain their publishers' copyright. See [docs/LICENSING.md](docs/LICENSING.md) for details and the open licensing decisions.
