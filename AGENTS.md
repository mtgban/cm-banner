# AGENTS.md

Guidance for AI coding agents working on **cm-banner**, a browser extension
that reads a Cardmarket seller's offers and gets them to mtgban's upload.
Read `SPECIFICATIONS.md` for what it does and what is known about
Cardmarket's markup; this file is about how to work on it without breaking
it.

## The one rule that matters

**Verify against a saved Cardmarket page, not against the fixture.**

The fixture in `tests/fixtures/offers.html` is a reconstruction. Every time
it has disagreed with a real page, the real page was right and the
reconstruction had been written to match whatever the code already did:

- Sealed offers parsed **0 of 20** on the first real page. The fixture had
  invented a three-segment sealed URL; Cardmarket files sealed under two.
  Fixture and parser agreed, and both were wrong.
- A common priced at **$11.53** instead of $0.06, because the price was read
  off the row's flattened text and a neighbouring quantity had glued itself
  to the front of the number. The fixture had no digit next to a price.
- Names were read from the URL slug until a real page showed **6 of 20**
  rows losing accents, commas, colons or a whole ligature to it.

None of these were subtle once a real page was in hand, and none were
visible without one. When you change the parser, ask for a saved page
(`Cmd-S`, complete) and run against it.

**Saved pages are not committable.** They carry the seller's session tokens
(`__cmtkn`). Work on them outside the repository and delete them after.

## Layout

```
manifest.json    MV3; two things matter — the host list and no permissions
src/rates.js     the currency feed, and the inversion it needs
src/parse.js     DOM → offers. The volatile half; see SPECIFICATIONS.md §3
src/pages.js     one page → every page, at Cloudflare's pace; see §6
src/csv.js       offers → CSV. The contract with mtgban; see §4
src/content.js   the panel, the download, the handoff
icons/           the stroopwafel, 128 is the original and the rest are made
tests/panel.js   stands the content script up in a window; clicks are real
tests/           bun + happy-dom, no browser
```

## Verifying

```
bun install
bun test tests/
```

That is the whole suite and it runs in CI on every push. It loads the real
`src/*.js` against a DOM and the fixture — no mocking of the code under
test.

There is no linter and no build step. The scripts are plain ES5-ish so they
can be `content_scripts` entries without bundling; keep them that way.

To look at the panel, load the extension unpacked and open a real offers
page. There is deliberately no demo page: the last one had to be taught a
fake offers path to get past the check for a supported game, which is a
demo arranging to look like the thing rather than being it.

### Two traps that cost real time here

**The browser caches `src/*.js` across reloads.** A fix can look like it did
not work when it is simply not loaded. A query string on the HTML does not
help — the `<script src>` is what is cached. Serve from a **fresh port** to
get a clean origin. This produced two rounds of "the fix didn't work" on a
fix that was already correct.

**A source-reading test says the code still reads right, not that it runs.**
A rewrite that sliced `content.js` between two comment markers swallowed
`var generation = 0;` along with the lines it meant to replace. `node --check`
passed, because a missing declaration is a runtime `ReferenceError` and not a
syntax error. The whole suite passed too, because the function body still
*mentioned* `generation`. The panel's main button silently did nothing, and it
took a user to notice.

`tests/panel.js` exists because of that: it evaluates the content scripts in a
happy-dom window, so a click is a click and the button's own text is the
assertion. Put anything the panel *does* there. Keep `content.test.js` for
orderings that have no visible result — opening a window before a read rather
than after it looks identical afterwards, and only a browser can tell you which
one it was.

**Reloading the extension is not enough.** A content script already injected
into an open tab keeps running the old code, so the Cardmarket tab needs
reloading too. And a `manifest.json` change — a new host, a permission —
needs the extension reloaded, not just the page. Icons are cached harder
still: removing and re-adding the extension is the reliable way to see a new
one.

**Cardmarket is behind Cloudflare, and it is the thing that decides whether
this works.** A `curl` gets a flat 403; three `fetch`es inside a second get a
challenge and then a "Verify you are human" checkbox on the next ordinary
page load. Treat that budget as the real constraint on anything that adds a
request, and never try to answer the challenge in code — it is meant for the
person at the keyboard, it is theirs to clear, and code that got around it
would be the worst thing in this repository. `PACE` in `src/pages.js` is a
guess at politeness, not a measured limit; if you change it, say in the commit
what you actually observed.

## Things not to do

**Do not drive mtgban's upload form.** An earlier version synthesised a
`File` into `input[name="cardListFile"]`, dispatched `change` so the page's
inline handler would fire, and clicked `#submit_default` because that is
where the submitting logic lives and it starts `disabled`. It worked, and
every line of it was a copy of mtgban's markup living in a repository that
does not own it. `/upload/handoff` exists so this does not have to happen
again; see SPECIFICATIONS.md §5.

**Do not add a permission, or declare a file web-accessible.** The extension
asks for none, runs on one host, and hands the pages it runs on nothing of its
own — the panel's stroopwafel is base64 in the stylesheet rather than a
relative `url()`, because that url resolves to the extension's origin and
serving it wants a manifest entry. `storage` was added once to carry a CSV between two tabs and removed
again when `postMessage` turned out to do it — the two windows can already
speak, because one opened the other. If something seems to need a
permission, check whether the web platform already offers it.

**Do not guess at a price, an id or a card.** A row that cannot be resolved
honestly carries an empty column and the panel says how many. Every place
this comes up, the refusal is the answer: an unknown currency, an id the
site does not carry, a row with no thumbnail. `SPECIFICATIONS.md` says why
in each case.

**Do not fan out the page walk.** Parallel fetches are the obvious speedup and
the fastest way to get the visitor challenged. One page at a time, with a wait
before each.

**Do not let the panel resize as it speaks.** It sits under the cursor; a
box that grows and shrinks moves the button being aimed at. If you add
anything that changes length, give it a fixed size first.

## Working with the other repositories

The CSV is a contract with **mtgban-website**, and the column names are
chosen for how `internal/docparse`'s header matcher reads them
(SPECIFICATIONS.md §4). Changing a column here without checking that file
there silently turns a resolved row into a name-matched one.

The condition fold is **go-mtgban**'s, in `cardmarket/market.go`. Do not
invent one; read it.

When a change here needs one there, land the site side first. An extension
that speaks a protocol the deployment does not serve is broken in a way the
person using it cannot fix.

## Commits

One topic per commit, wrapped at 80 columns, with the reasoning in the body
rather than the diff. Say what was measured and what it came to — the
numbers in `SPECIFICATIONS.md` came out of commit messages, not the other
way round. No `Co-Authored-By` lines.
