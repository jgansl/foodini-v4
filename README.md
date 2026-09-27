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

## Tests

```bash
pnpm test        # unit tests (lib/)
pnpm test:int    # database + row-level security (needs local Supabase)
pnpm test:e2e    # Playwright (needs local Supabase; stop `pnpm dev` first)
```

## Deploying

1. Create a Supabase project. Set `DATABASE_URL` to its connection string (transaction pooler), then run `pnpm db:migrate`.
2. In Auth → URL Configuration, set the Site URL to your domain and add `https://<your-domain>/**` to the redirect URLs.
3. In Auth → Email Templates, set both **Magic Link** and **Confirm signup** to the body of `supabase/templates/magic-link.html`.
4. On the host, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `SITE_URL` and `ALLOWED_EMAILS`. Do not set `SUPABASE_SECRET_KEY` or `IMPORT_ALLOW_PRIVATE` in production.
