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
```

## Deploying

1. Create a Supabase project. Set `DATABASE_URL` to its connection string (transaction pooler), then run `pnpm db:migrate`.
2. In Auth → URL Configuration, set the Site URL to your domain and add `https://<your-domain>/**` to the redirect URLs.
3. In Auth → Email Templates, set both **Magic Link** and **Confirm signup** to the body of `supabase/templates/magic-link.html`.
4. After you have signed in once, turn off Auth → Sign In / Providers → **Allow new users to sign up**. The app also rejects sessions for addresses not in `ALLOWED_EMAILS`, but this stops strangers from creating accounts at all.
5. On the host, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `SITE_URL` and `ALLOWED_EMAILS`. Do not set `SUPABASE_SECRET_KEY` or `IMPORT_ALLOW_PRIVATE` in production.

## License

Copyright © 2026 Jesse Gansler. All rights reserved.

Foodini is proprietary and has no open-source license yet: the code may not be copied, modified or redistributed without permission. Dependencies are under their own (mostly permissive) licenses, and recipes imported from other websites remain their publishers' copyright. See [docs/LICENSING.md](docs/LICENSING.md) for details and the open licensing decisions.
