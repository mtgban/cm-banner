# One extension for Cardmarket, Card Kingdom and TCGplayer

Status: plan, reviewed once (Fable, 2026-11-21) and revised. PR 1 is the
one that carries this file.

## Where things stand

Three extensions, one design, almost no shared code (all on `master`,
2026-11-21):

| | cm-banner | ck-banner | tcg-banner |
|---|---|---|---|
| Runs on | `www.cardmarket.com/*/*/Users/*/Offers/*` | CK carts and history pages | `store.tcgplayer.com/*`, gated to the order history in `page.js` |
| Does | a seller's offers: CSV, Send to BAN | carts against CK's price list, Update price, cart CSV; purchases and sales history CSV by year | order history CSV by year or last 30/90/120 days, one order's cards CSV, order-number search, Send to BAN |
| Source | 2,348 lines, 987 of them `content.js` | 3,324 lines, 15 files | 1,933 lines, 10 files |
| Global | `MKM` | `CKB` | `TCGB` |
| Commits | 76, 2026-09-21 to 10-01 | 44, 10-07 to 10-12 | 32, 11-20 to 11-21 |
| happy-dom | 15 | 20 | 21 |
| Mutation tests | no | 104 guards | 46 guards |
| Open PRs | Dependabot #5, #7 | Dependabot #19 | none |

`ck-banner` and `tcg-banner` share `scripts/mutate.mjs` (2 lines apart) and
`ci.yml` (identical); the icons are byte-identical in all three. The
"shared" modules are copies that have drifted, and not only in the name of
the global: `net.js` differs on 116 lines, `ui.js` on 36, and fixes have
stopped crossing over. TCGplayer's panel pins `font-weight: 400`, the other
two inherit whatever the page sets.

The two handoffs are not one design either. cm opens the upload tab on the
click and hands it rows later, since its page walk runs at Cloudflare's pace
and `window.open` needs the click (`content.js` 597-665, pinned by
`content.test.js`); tcg hands over rows already in hand. Both check the
origin with `isBanHost`, both report a blocked pop-up and a closed tab; tcg
alone notices the tab closing while it waits (`onFocus`). They recover
differently on purpose: cm keeps its rows and says "use the CSV", tcg says
"try again" and closes a replaced tab.

No one has any of the three installed, so ids, names and versions are free.

## Goal

One extension, one repository, one test run, open to more stores. Each store
keeps everything it does today, and what one store does for a kind of page
the others do too, where the store makes it possible (section 5). History of
all three is kept.

## 1. The repository

**Home: `mtgban/cm-banner`, renamed `mtgban/browser-banner`.** It has
the most history; GitHub redirects the old name. `ck-banner` and
`tcg-banner` are archived after their import, with a README pointing at the
new repository. **They are never deleted**: the import gives every one of
their commits a new id, and the archived repositories are where the
original ids, PRs and review threads stay readable.

Alternative: a new repository. That needs a first push straight to its
`master`, which the plan below avoids.

## 2. Keeping the history

The histories do not overlap in time and none has a merge commit, so the
result is **one linear history**, reached through ordinary PRs and
rebase-merge, with no push to `master`.

- **cm's commits are not rewritten.** One commit moves its files under
  `sites/cardmarket/` with `git mv`. `git blame` follows that rename;
  `git log` needs `--follow` across it.
- **ck's and tcg's commits are replayed into their directories** with no new
  tool:

  ```
  git -C <fresh clone> format-patch --root --stdout master > ck.mbox
  git am --directory=sites/cardkingdom < ck.mbox
  ```

  in a temporary worktree under `~/src/claude-scratchpad/worktrees/`, never
  in a main checkout. Files are born at `sites/<store>/...`, so `log` and
  `blame` work on them with no rename. Author name, email, date and message
  are kept. The committer and commit date become the importer's, and the
  ids change again at rebase-merge.
- **Bare `#N` is qualified** in the mbox before `am`: tcg's one message
  naming `#2` becomes `mtgban/tcg-banner#2`, since `#2` in the new
  repository is another PR. ck has none; cm's stay as they are, since they
  name cm's own PRs and cm is the home.
- **One store per PR**, so each is about 45 commits: well under any limit
  GitHub puts on rebase-merge (believed to be 100, not verified), and
  reviewable. The imported commits are history and are not gated one by
  one; the gate runs on each PR's tip.

Check after each import merges: `git log --format=%s -- sites/tcgplayer/src/walk.js`
equals `tcg-banner`'s `git log --format=%s -- src/walk.js`, and likewise one
file of ck.

## 3. The layout

```
manifest.json            one manifest, every store's content scripts
core/                    what the stores share (section 4)
sites/cardmarket/        src/, tests/, SPECIFICATIONS.md, AGENTS.md
sites/cardkingdom/       the same
sites/tcgplayer/         the same
icons/                   one set
scripts/mutate.mjs       one runner over every site's mutations.json
tests/                   repo-wide: manifest, permissions, no em dash
AGENTS.md, README.md     the rules all three share, and what each store does
.github/                 one CI, one Dependabot
```

Each store's `SPECIFICATIONS.md` stays its own: they describe three sites'
markup and none of it is shared. The root `AGENTS.md` takes the rules the
three already agree on (no permissions, no guessing, no fanned-out walks,
the panel never resizes, verify against a saved page, no em dash) and each
site's `AGENTS.md` keeps what is that site's own.

## 4. The order of PRs

One PR at a time, each off a fresh `master` after the previous merged; none
stacked. The full suite and the mutation run pass on each tip, and each says
which behaviour, if any, it changes.

1. **Lay out the repository.** cm's `src/`, `tests/`, docs, `manifest.json`,
   `package.json` and `icons/` move to `sites/cardmarket/`; `.github/`,
   `LICENSE` and a new `.gitignore` (with `node_modules/`) stay at the root.
   A root `package.json` and `bun.lock` on happy-dom 21; cm's tests move
   from 15 to 21 here. Each site keeps its own
   manifest for now, which is what its `tests/panel.js` and `repo.test.js`
   read, so every site still loads unpacked from its own directory.
2. **Mutation guards for Cardmarket.** `scripts/mutate.mjs` (from tcg),
   rewritten to take a site directory and find its `mutations.json`,
   `src/` and `tests/` there, with `node_modules` at the root, and a CI job
   running it for each site that has guards. Then the guards, before
   anything rewrites cm's 987-line `content.js`, which today is guarded
   partly by tests that read its source between markers, the failure cm's
   own AGENTS.md describes.
3. **Import ck-banner** (section 2), then one commit that removes what the
   root now owns (its `.github/`, `package.json`, `bun.lock`, `.gitignore`)
   and moves it to happy-dom 21. Its `LICENSE`, `icons/` and `manifest.json`
   stay until PR 5, since unpacked loading needs them.
4. **Import tcg-banner**, the same way.
5. **One manifest.** Root `manifest.json` with every store's
   `content_scripts` entries as each names them today, paths prefixed; name
   `BANner` (section 8), a new gecko id, version `0.2.0` from the root
   `package.json`. Each site's harness loads **only the entries whose
   `matches` are its own host**, prefix stripped; tcg's today evaluates
   every entry, which would load the other stores into its window. Each
   site's `repo.test.js` pins its own entries; a root test pins exactly the
   three hosts, no `permissions`, `host_permissions`, `background` or
   `web_accessible_resources`, no extension API in `core/` or `sites/`, that
   no site's scripts name another site, and no em dash anywhere in `core/`,
   `sites/`, `docs/` or the root docs. The site manifests, `LICENSE`s and
   icon copies go.
6. **One class prefix.** `ban-` for `cm-banner-`, `ck-banner-`,
   `tcg-banner-` and the three panel ids, alone in its PR: every selector in
   the three `panel.js` harnesses, the site CSS, the `repo.test.js` regexes
   and the `find` strings of the guards that name a class. No behaviour
   change; its commit goes in `.git-blame-ignore-revs`.
7. **Shared panel.** `core/ui.js` and `core/panel.css` are the **union** of
   the three, not tcg's: tcg's skeleton and hidden separator, ck's heading
   jump (`jump`, `release`, called eight times in `cartpage.js` and removed
   from tcg's in `843152f`), cm's heading as a scope control and its armed,
   calling and locked states. What one store alone uses is an option the
   others leave off. Mutation guards on moved code move with it. Visible
   change: the font-weight fix reaches Cardmarket and Card Kingdom.
8. **Shared handoff.** `core/handoff.js` takes **cm's shape**: the tab opens
   on the click and the rows come as a promise, so a walk can run after the
   click; tcg passes rows already in hand. One host table (cm's nine
   games), and each site passes **the games it may send**: Cardmarket all
   it can name, TCGplayer Magic alone, as today (`page.js` tests
   `handoffURL(l.game)` to count other games out and then sends to
   `"magic"`; the nine-game table under that test would send Pokemon cards
   to the Magic site). Each site keeps its own recovery wording. Visible
   change: Cardmarket notices its tab closing while it waits, as tcg does.
9. **Shared net and CSV writing**, then 10. **shared money**: pacing,
   deadline, the Cloudflare and 429 checks into `core/net.js`; the
   Go-`csv.Writer`-compatible writer into `core/csv.js`; `cents`, `dollars`
   and the day arithmetic into `core/money.js`. Columns and date shapes stay
   each site's own.

**No shared state.** `core/` exports factories on `globalThis.BAN`, and each
site binds what it uses onto its own global with its own settings
(`TCGB.fetchPage = BAN.net({ store: "TCGplayer" }).fetchPage`). `PACE`, the
store's name in messages, and anything a test swaps stay on `MKM`, `CKB`
and `TCGB`. bun runs every test file in one process, and three suites that
re-evaluated one stateful `BAN` would overwrite each other's `PACE = 0` and
stand-ins (tcg's `helpers.js` already restores `REAL` for this reason). A
root test loads all three sites into one window and checks no site's
global is touched by another.

## 5. Parity: what each store gains

What exists today, and the proposed gaps to fill. Each is its own PR after
section 4, and each that reads a page nobody has parsed yet waits for a
saved page of it (AGENTS.md's one rule).

| Feature | Cardmarket | Card Kingdom | TCGplayer |
|---|---|---|---|
| CSV of the list in front of you | offers | history, both carts | history, one order |
| Send to BAN | offers | **add: both carts** (P1) | one order, every order header |
| Games BAN receives | the eight Cardmarket sells and BAN prices | Magic (CK's carts) | Magic |
| One order's cards | n/a | **add: invoice pages** (P2) | yes |
| Range | all offers / this page | year, All years; **add last 30/90/120 days** (P3) | year, last 30/90/120 days; **add All years** (P3) |
| Purchase history CSV | **add: Orders > Purchases** (P4) | yes | yes |
| Sales history CSV | n/a | yes | n/a, sales live in the seller portal, out of scope |
| Kept work | a Send read's rows | history files in IndexedDB | each year's walk, in memory |
| Signed out | panel on the page in front, says why | carts work, history gets no panel | n/a, the history needs a sign-in |
| Price list comparison | n/a, no public list | yes | n/a, no public list |
| Heading jumps to the next marked line | n/a | yes | n/a |
| Order-number search | n/a | n/a, ids are links | yes |

- **P1, CK Send to BAN on the carts.** The cart CSV already carries
  mtgban's columns and Scryfall ids; Magic only. No new page to read. It
  changes ck's rule that its scripts name no site but Card Kingdom's, which
  PR 5's root test replaces with "names no other store; `core/` names
  mtgban".
- **P2, CK invoice pages** (`/myaccount/invoice/<id>`,
  `/myaccount/po_invoice/<id>`): Download CSV of the order's cards and Send
  to BAN, as tcg's single-order view does. Needs saved invoice pages and a
  new `matches` entry.
- **P3, ranges.** CK gains the last 30/90/120 days, never kept in
  IndexedDB (ck keys kept files by year, and a moving range has no stable
  key; tcg already keeps only years). tcg gains All years, which costs one
  POST and a walk per year, at 1.2 s a request, plus putting the filter
  back: its tooltip says how many requests before it starts. The range
  options and their file names become one shared helper.
- **P4, Cardmarket purchases.** A new page and `matches` entry, a new walk
  under Cardmarket's tighter Cloudflare budget, and euros to convert. The
  largest; proposed last and only if wanted.

Not proposed: the price comparison and Update price elsewhere (only CK
publishes a price list), the heading jump elsewhere (only CK marks lines on
the page), and porting CK's IndexedDB cache to the other two.

## 6. Checks on the live sites

Not automatable, and not to be automated: each store is behind Cloudflare,
and every sign-in is the account owner's. After PRs 5, 7 and 8 the extension
is loaded unpacked in Chrome and Firefox and each store's main path is
clicked once by its owner: a Cardmarket seller's offers to Send to BAN, a CK
sell cart with Load prices and a year's history, a TCGplayer year and one
order to Send to BAN. Each site's own "not verified" list carries over
unchanged.

## 7. Cleanup

As each import merges: close that repository's open Dependabot PRs
(superseded by the root lockfile) and archive it with a pointer README. After
both: rename the home repository. The local checkouts in `~/src`, and the
untracked files in them, are left for the owner.

## 8. Decisions for the owner

1. ~~The repository's new name~~: `mtgban/browser-banner`.
2. The extension's name in the browser: `BANner`; the panel heading keeps its
   store prefix (`CM BANner`, `CK BANner`, `TCG BANner`), or becomes
   `BANner` everywhere.
3. Which of P1 to P4 to do, and in what order. Suggested: P1, P3, P2, then
   P4 only if wanted.
