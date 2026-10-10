<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deferred work

File all deferred work as a GitHub issue in this repo (`gh issue create`). That covers anything you notice but don't do now: review findings you didn't fix, known bugs, TODOs, follow-ups, and anything skipped or descoped from a plan.

- Create the issue in the same change that defers the work. Don't leave `TODO` comments in code as the only record.
- Search first (`gh issue list --search "<keywords>" --state all`) so you don't file a duplicate.
- Title: what is wrong or missing, in one line. Body: where (file or feature), why it matters, and a suggested fix if you have one. Don't put secrets or personal data in an issue.
- Labels: always `deferred`. Add `bug`, `enhancement`, `accessibility` or `documentation` as fits, and `blocks-later-phase` for anything a later phase depends on (what used to be ★).
- When you finish one, reference it in the commit or PR (`Fixes #123`) and note the fix in `docs/CHANGELOG.md`.
- Record a significant design choice made while deferring in `docs/DECISIONS.md`.
- `docs/ROADMAP.md` keeps the phase table and phase notes. Its **Backlog** section only points at the `deferred` issues; don't list work there.

# Legal and licensing

Check legal and licensing implications as part of every change, not just at release time. Foodini currently has no license: the repo is private and all rights are reserved.

- **New dependencies:** before adding a package, check its license with `pnpm licenses list --prod` or the package's `license` field.
  - MIT, Apache-2.0, BSD, ISC, 0BSD and Unlicense are fine.
  - Stop and ask before adding anything under GPL, AGPL, LGPL (new direct dependencies), SSPL, BUSL, Commons Clause, a non-commercial license, or no license at all. Record the outcome in `docs/DECISIONS.md`.
- **Copied code:** don't paste code from Stack Overflow, blogs, other repositories or AI-suggested snippets without confirming its license is compatible. Credit the source in a comment when the license requires it.
- **Third-party content:** recipe text and photos fetched by the importer belong to their publishers. Keep them private to the user who imported them. Any feature that shares, publishes or redistributes imported content needs a legal note in the plan first.
- **Scraping:** the importer fetches a single page the user asked for. Don't add crawling, bulk import, ways around bot blocks (such as spoofing a browser user agent) or scraping of paywalled pages without asking first.
- **User data:** before adding analytics, third-party services, emails or data exports, note the privacy implications (what personal data leaves the app, and where it goes) in the plan.
- **Name and branding:** "Foodini" may conflict with an existing trademark. Don't add logos, domains or marketing copy that depend on the name until the trademark check in the backlog is resolved.
- **Before every PR:** run `pnpm licenses list --prod` and compare it with the previous run. Mention any new or changed license in the PR description.
- **Open questions:** file every unresolved legal or licensing question as an issue labelled `deferred` and `legal`.
- **Licensing record:** keep `docs/LICENSING.md` current whenever a dependency's license changes, a project license is chosen, or a new kind of third-party content enters the app.
