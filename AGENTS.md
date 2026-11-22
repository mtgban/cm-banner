# AGENTS.md

Guidance for AI coding agents working on **browser-banner**. Each store's
extension lives under `sites/<store>/` with its own `AGENTS.md` and
`SPECIFICATIONS.md`: read the ones for the store you touch before changing
it, and follow them. Their rules hold here unchanged.

What holds for the whole repository:

- **Verify against a saved page of the store, not against a fixture.** Saved
  pages carry the visitor's session and are never committed as they are;
  each site's AGENTS.md says how to cut a fixture from one.
- **No permissions, no background script, no web-accessible files.** A site
  runs on its own store's host and nowhere else.
- **Never answer a Cloudflare challenge in code**, and never fan out
  requests: one page at a time, with a wait before each.
- **Do not guess at a price, an id or a card.** A row that cannot be
  resolved carries an empty column and the panel says how many.
- **Do not write an em dash**, anywhere: `tests/repo.test.js` checks the
  root docs and `docs/`, each site's tests check its own.

## Verifying

```
bun install
bun run test
```

runs every site's suite and the repository's own tests, as CI does.

## Commits

One topic per commit, wrapped at 80 columns, with the reasoning in the body
rather than the diff. No `Co-Authored-By` lines.
