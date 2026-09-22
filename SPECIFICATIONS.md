# cm-banner — Specification

> Written 2026-09-22, from the work that built the extension. Every fact
> about Cardmarket's markup below was read off real pages rather than
> inferred: fourteen consecutive saved singles pages and one sealed one,
> and — for §6 — the responses cardmarket.com's own server gave to a
> browser asking for the next page. Where something is unverified it says
> so.

## 1. What it is

A browser extension (MV3) that reads the offers on a Cardmarket seller's
page and gets them to mtgban's upload, either as a CSV file or by handing
them to the site directly.

It asks for **no permissions** and runs on **one host**. There is no
background script, no storage, and no extension API call anywhere in the
source. The parse is a DOM read, the download is a blob and an anchor, and
the handoff is `postMessage`.

```
src/rates.js     currency feed → multipliers
src/parse.js     DOM → offers
src/pages.js     one page → every page
src/csv.js       offers → CSV text
src/content.js   the panel, and the two things its buttons do
icons/           the BAN stroopwafel at 16/32/48/128
tests/           bun + happy-dom, run in CI
```

The scripts are plain (not modules) and share `globalThis.MKM`, because
that is what a manifest's `content_scripts` list can load.

## 2. Where it runs

```
https://www.cardmarket.com/*/<Game>/Users/*/Offers/*
```

for the seven games Cardmarket sells that BAN prices: Magic, Pokemon,
YuGiOh, Lorcana, OnePiece, FleshAndBlood, Riftbound. The path segment is
the game, capitalised as Cardmarket writes it.

A page that reaches the content script naming a game with no deployment
behind it gets **no panel at all** — `install()` asks where the rows would
go before drawing anything. A panel whose main button can only apologise is
worse than no panel. `tests/csv.test.js` holds the manifest's game list
against `HOSTS` in `content.js`, since those disagreeing is what that check
exists to catch.

## 3. Cardmarket's markup

Everything here was read off saved pages. It is the volatile part of this
repository: a redesign invalidates the section.

### 3.1 The row

```html
<div id="stockRow2058737078" class="row g-0 article-row">
```

Selected with `[id^="stockRow"]`. The same string also appears as
`data-ajax-loader="stockRow2058737078"` on a form inside the row, which is
why the selector is on `id` and not a text match — a page of 20 offers
contains 40 occurrences of `stockRow`.

The digits are the **article id**: the offer, not the product. Two sellers
listing the same card have different ones. It is carried through to the CSV
so a row can be traced back, and deduplicated on, since a row drawn twice is
one offer.

### 3.2 The product link, and its two shapes

```
singles  /en/Magic/Products/Singles/Urzas-Legacy/Thornwind-Faeries?language=1&minCondition=4
sealed   /en/Magic/Products/Boosters/Adventures-in-the-Forgotten-Realms-Set-Booster?language=1
```

A single is filed under its **set**; a sealed product is filed directly
under its **category** and carries its set inside its own name. So the tail
after the category is taken whole and split afterwards — two segments name a
set and a card, one names a product — rather than a fixed depth being
demanded of every category.

Categories seen on a real page: `Singles`, `Sealed-Products`, `Boosters`,
`Booster-Boxes`, `Sets-Lots-Collections`, `AlteredArt`, `Accessories`.

### 3.3 The name is in the link, not the slug

A slug is what survived being made URL-safe. On one 20-offer page, **6 rows**
differed between the two, all six losing something:

| slug | link text |
| --- | --- |
| `" ther Tide"` | `"Aether Tide"` |
| `"Adewale Breaker of Chains"` | `"Adéwalé, Breaker of Chains (V.1)"` |
| `"Art Series Legolas Counter of Kills"` | `"Art Series: Legolas, Counter of Kills (V.1)"` |
| `"Alexios Deimos of Kosmos"` | `"Alexios, Deimos of Kosmos"` |

Æther Tide is the instructive one: Cardmarket slugs it `-ther-Tide`, dropping
the ligature outright, so a name read from the slug begins with the space
that leading dash becomes.

The `(V.n)` index rides along deliberately — it is how Cardmarket tells two
printings of one card apart, and `Match`'s prefilter splits parentheticals
off the name anyway.

`slugToName` remains as the fallback for a link with no text, and still
handles the `-s-` apostrophe and the `-V\d+` suffix.

`edition` still comes from the slug and loses punctuation the same way
(`Urzas Legacy`). Harmless: the matcher normalizes it.

### 3.4 The product id is the image's file name

```
singles  product-images.s3.cardmarket.com/1/ULG/10601/10601.jpg
sealed   product-images.s3.cardmarket.com/2/565902/565902.png
```

Read as the last path element before the extension, not at a fixed depth —
the two shapes above differ in how much precedes it. The pattern requires
the filename to be digits, which is what keeps it off the sprite sheets and
expansion icons in the same row (`ssMain2.png`, `expicons.png`).

An older layout named the file after the card and the id a directory
(`/items/9/265854/mirris-guile.jpg`). It appears **zero** times on current
pages; the pattern is kept for saved pages from that era.

**A row can carry no image at all** — 1 of 20 on one saved page. There is
then no product id, the CSV column is empty, and the upload falls back to
name and edition. That is correct behaviour, not a gap.

### 3.5 Grades and flags are tooltips, in either of two attributes

Bootstrap moves `title` to `data-bs-original-title` when it initialises a
tooltip, so both are read; on one saved page some rows had one and some the
other.

Grades: `Mint`, `Near Mint`, `Excellent`, `Good`, `Light Played`, `Played`,
`Poor`. Also seen in that attribute: the expansion name, `English`, `Foil`,
`Signed`, `Put in shopping cart`, `Shipping`.

`Altered`, `Signed` and `Inked` rows are dropped: they are not the printing
the catalog knows, and no id names them.

Sealed rows carry **no grade at all**, and none is invented for them.

### 3.6 The price is in its own element

Read off the element whose whole text is a price, never off the row's
flattened text. A real row's `textContent` is:

```
"Thornwind FaeriesGD10,05 €0,05 €1"
```

The price is `0,05 €`. The `10,05 €` is an illusion — a neighbouring `1`
glued to the front of it by concatenation. The first run against a saved
page priced a common at $11.53 because of exactly this.

Cardmarket writes a decimal comma and groups thousands with a full stop
(`1.250,00 £`). Currencies seen: `€`, `£`.

A row may show two prices — the item and the item plus shipping. The unit
price comes first in DOM order.

### 3.7 Language

`?language=1` is English, `?language=7` Japanese. The language is also an
`English` tooltip, but the query parameter is what is read.

Every listing is exported whatever its language, and the panel reports how
many are not English. It is **reported rather than filtered on** because
neither answer is good: the CSV has no language column and the upload has
nothing to read one into, so a German printing is valued as the English one
at a price asked for a different card — but dropping those quietly hides
cards the person owns from their own valuation.

A listing whose link names no language is not counted; nothing says it is
not English.

Making this properly right means a language column on the upload side,
mapping Cardmarket's ids onto `mtgmatcher.InputCard.Language`.

## 4. The CSV

```
mcm_id,card_name,edition,condition,foil,quantity,price_usd,article_id
10601,Thornwind Faeries,Urzas Legacy,MP,,1,0.06,2058737078
565902,Adventures in the Forgotten Realms Set Booster,,,,8,11.48,2036785656
,Mirri's Guile,Zendikar,PO,,1,,2057222480
```

Every column name is chosen for how mtgban's `docparse.ParseHeader` reads
it:

| column | reaches | note |
| --- | --- | --- |
| `mcm_id` | `mkmID` | matched on `(mcm\|mkm\|cardmarket)` **and** `id` |
| `card_name` | `cardName` | contains "name", not edition/set/expansion |
| `edition` | `edition` | |
| `condition` | `conditions` | |
| `foil` | `printing` | `"foil"` or empty |
| `quantity` | `quantity` | |
| `price_usd` | `price` | contains "price" |
| `article_id` | *nothing* | falls through every case, deliberately |

`article_id` is safe to carry precisely because nothing reads it. `id`
alone would not be: the site's own export writes `Original Id` and
`Instance Id`, which is why the Cardmarket case needs both halves of the
name.

### 4.1 Conditions fold seven grades onto five

The mapping is go-mtgban's own, in `cardmarket/market.go`'s `mkmCondition`:

| Cardmarket | | mtgban |
| --- | --- | --- |
| Mint, Near Mint | → | NM |
| Excellent | → | SP |
| Good | → | MP |
| Light Played, Played | → | HP |
| Poor | → | PO |

**Both played grades land on HP**, and `Good` is the only grade that is
`MP`. Writing `Light Played` as `MP` hands the upload a better card than the
seller listed, and the upload trusts what it is given. `cmd/mkmhtml2csv` in
go-mtgban carries the same table and had this wrong.

### 4.2 The price is converted

The upload holds a given price against mtgban's own, and those are dollars,
while Cardmarket quotes euros or pounds. The rate comes from the same feed
go-mtgban reads (`mtgban/utils.go`):

```
https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json
```

It serves `Access-Control-Allow-Origin: *`, so a content script can fetch it
with no host permission. It quotes what one dollar buys, so a price going
the other way is **divided**: `rates[c] = 1 / quoted[c]`. A currency quoted
at zero is left out rather than kept as an infinity — it converts nothing,
and a missing entry omits the price where an infinity would invent one.

A row that cannot be converted honestly — no rate, an unfamiliar currency,
an unreadable number — carries an **empty** price, and the panel says how
many.

### 4.3 What the CSV deliberately does not carry

- **No language column.** The upload has nothing to read one into. See 3.7.
- **No uuid.** Resolving an id to a card is the site's job and needs its
  datastore.

## 5. Sending to BAN

### 5.1 Why the rows are not posted

The upload needs the session. mtgban's `MTGBAN` cookie is set with
`global=true`, which leaves `SameSite` unset, so browsers default it to
**Lax** — not sent on a cross-site POST. A request made from
cardmarket.com arrives unauthenticated whatever CORS says, because CORS
governs who may *read* a response, not whether credentials ride along.

Making a direct POST work would need `SameSite=None; Secure`, which is not
scoped to one site: it sends the session on cross-site requests from any
origin, and CORS only stops them reading the reply. With `CanPOST` on
`/upload` and `/admin`, that is a CSRF hole needing tokens.

A hidden iframe does not escape it either — an mtgban frame inside a
cardmarket page is a third-party context, which Safari blocks outright,
Firefox partitions, and Chrome is phasing out. An `about:blank` iframe
inherits the Cardmarket origin, so a POST from it is cross-site again.

### 5.2 What happens instead

mtgban serves `/upload/handoff`: a page that holds no list of its own,
opens as an ordinary navigation (so it carries the session), receives rows
from the window that opened it, and submits them itself.

```
extension  window.open("https://<host>/upload/handoff")
handoff  → { type: "mtgban-handoff-ready" }        to each allowed origin
extension→ { type: "mtgban-handoff-rows", csv, rows }  to the origin that spoke
handoff    fills its form, submits, page navigates to the valuation
```

Both ends check who they are talking to:

- the extension accepts only the window it opened, at a host matching
  `mtgban.com` or `*.mtgban.com` over https;
- the handoff page accepts only an origin on its server-side list, from the
  window that opened it.

The **origin is checked for being one of ours rather than for being the one
asked for**, because a deployment may redirect and land on a different
origin — see 5.3. What pins the conversation to the right window is the
source check beside it, which a redirect does not disturb.

`rows` is passed because the page receives text, and text does not say
whether its first line is a header or a card.

### 5.3 Hosts, and the Magic exception

| game | host |
| --- | --- |
| magic | `mtgban.com` |
| pokemon | `pokemon.mtgban.com` |
| yugioh | `yugioh.mtgban.com` |
| lorcana | `lorcana.mtgban.com` |
| onepiece | `onepiece.mtgban.com` |
| fleshandblood | `fleshandblood.mtgban.com` |
| riftbound | `riftbound.mtgban.com` |

**Magic is the default deployment and answers at the bare domain.**
`magic.mtgban.com/upload` 308-redirects to `mtgban.com/upload`; the other
six serve their own subdomain directly (verified with `curl`). Naming Magic
by its subdomain both sends the rows a hop out of their way and changes the
origin mid-flight, which broke the handshake until the origin check was
loosened as above.

## 6. Reading every page

Cardmarket shows twenty offers to a page. An export that took only the
page on screen would hand over a twentieth of a seller's list in a file
that looked complete, so the walk follows the pager to the end.

### 6.1 The pager

Drawn twice, above and below the table, inside `div.pagination`:

```html
<span class="total-count">1093</span><span>&nbsp;Hits</span>
...
<a href="/en/Magic/Users/Seller/Offers/Singles?site=3"
   data-direction="next" class="... pagination-control">
```

Three things are read from it, and two things beside it are deliberately
not.

**The next page is `a[data-direction="next"]`.** On the last page
Cardmarket draws the same anchor with **no `href` at all** and adds
`disabled`, so "is there another page" and "does the link have an href"
are the same question. That is what ends the walk — not arithmetic over a
total that can move while the walk is running. Confirmed on both the live
`?site=55` and a saved last page.

**The href's shape depends on where it was read.** The server writes it
**relative** (`/en/Magic/Users/…?site=3`); the same control on a page
saved out of a browser carries it **absolute**. It is resolved against the
page it came from, which is right for both.

**The filter comes with it.** Cardmarket writes the query it was given
back into the link, so a seller's page filtered to English walks the
filtered list. The same seller read 1093 offers over 55 pages unfiltered
and 251 over 13 with `idLanguages=1`.

**The count is `.total-count`, not "Page 5 of 13".** That sentence is
written in whichever of Cardmarket's six languages the visitor reads; the
number beside it is not. It is used only to say how far along the walk is
and to label the button — nothing terminates on it.

**The walk starts at page one, wherever the seller's page was left.**
Cardmarket numbers pages with a `site` parameter and omits it on the
first, which is what page two's own previous-page link points at, so page
one is the current URL with `site` removed. Walking forward from page five
would silently drop four pages.

### 6.2 The list stops at 100 pages

Cardmarket pages a seller's offers to **100 pages of twenty — 2000 offers
— and no further**. A seller with ten thousand cards has eight thousand
of them that this listing will not reach at all.

It says so with a plus on both numbers, and only with that:

```html
<span class="total-count">2000+</span><span>&nbsp;Hits</span>
<span class="mx-1">Page 100 of 100+</span>
```

Page 100's next-page control is then `disabled` with no `href`, **exactly
as a genuine last page's is**. So the walk ends there tidily, and nothing
in the rows, the row count or the terminator distinguishes "that was the
whole list" from "that is as far as Cardmarket will go". The plus is the
only signal, which is why it is carried rather than parsed away:

- `totalSaid()` returns the text as printed — `"2000+"`, not `2000` — and
  the button prints it, because "Export 2000 offers" off a ten-thousand
  offer seller promises an exact figure that is not one.
- `totalCount()` still returns 2000, for counting up to while the walk
  runs.
- `capped()` is the plus, and the walk carries it out to the panel, which
  says the export is Cardmarket's limit rather than the whole shelf.

The way past it is the seller's own filters, which the walk already
respects (§6.1): a listing sliced by set, language or condition is a
different listing, each with its own 100 pages.

### 6.3 Cloudflare decides how fast this can go

Cardmarket is behind Cloudflare, and this is the binding constraint on the
whole feature.

- A plain `curl` for a public offers page is refused outright: **403**.
- A `fetch` from the page itself is answered normally — same-origin, so it
  carries the session and needs no permission.
- **Three of those inside one second were answered with a challenge**: 429
  carrying `cf-mitigated: challenge` and a "Just a moment…" interstitial,
  and then a "Verify you are human" checkbox on the next ordinary
  navigation.

That last state is not a rate limit that lapses while the extension waits.
It is a check meant for the person at the keyboard, and nothing an
extension can send answers it. So:

- The walk **paces itself**, one page at a time with a wait between them
  (`PACE`, 1200ms). The wait goes before each fetch rather than after, so
  a one-page seller pays nothing for it.
- A challenge is **told apart from an ordinary refusal** by the
  `cf-mitigated` header, and **stops the walk immediately** rather than
  retrying into a door being held shut.
- The request asks the way a page load asks (`Accept: text/html,…`),
  because a request for an HTML page that says it will take anything is
  one of the things that makes a fetch look unlike somebody reading.

`PACE` is a judgement and not a measured ceiling. Cardmarket does not
publish one, and establishing it properly would mean hammering someone's
site until they stopped answering.

### 6.4 The scope is the visitor's to choose

The panel carries a **This page only** checkbox, and the button says which
it means — `Export 251 offers` against `Export 20 offers` — because naming
the wrong one is how a twentieth of a collection gets uploaded as all of
it.

The whole list is the default: a file holding one page of a seller's stock
is indistinguishable from a complete one once it has left here. One page is
the escape hatch, and it costs no requests at all.

Taking one page answers in the same shape a walk answers in, so everything
downstream of it — the pricing, the counting, the CSV, the handoff — is the
same code either way.

### 6.5 What a partial walk does

Whatever was read is kept and handed over, and the panel says the walk
stopped early and why. A short list is worth having; a short list that
reads like a whole inventory is not.

This is also why a partial export keeps its warning on screen after being
handed to BAN, where a complete one clears it: the receiving tab cannot
tell that the list is short, and neither could anyone reading it there.

### 6.6 The walk is not atomic

Thirteen pages take some seconds, and the seller's stock moves underneath
it — the same seller was measured at 262 offers over 14 pages one
afternoon and 251 over 13 that evening.

A sale between two fetches shifts every later offer up a place. That can
show one row twice, which the dedupe on article id covers, and can hide
another, which nothing here covers. What comes back says how many were
read against how many the first page promised, so a walk that lost one can
be seen to have lost it.

## 7. Not verified

Stated plainly so nobody takes them as tested:

- **The two-window handshake has never run in a real browser.** Both halves
  are covered by tests, but two real tabs talking to each other are not.
  `window.open` navigates in place in the browser available during
  development, so it could not be exercised there.
- **Sealed markup beyond one saved page.** One page of Boosters was read.
  Other sealed categories are assumed to share its shape.
- **Safari.** The extension is written to run there and has never been
  built for it.
- **That `PACE` is slow enough.** The walk was run live only at full
  speed, which is what provoked the challenge and established that the
  pacing was needed. The paced walk has never completed against
  Cardmarket, because provoking the challenge is what it takes to find
  out, and answering it is the visitor's to do.
- **A walk of any real length.** 100 pages at `PACE` is around two
  minutes, and that has not been sat through. The ceiling's *shape* is
  verified — from a saved page 100, which is where the `2000+` and the
  disabled terminator above were read — but no capped seller has been
  walked end to end.
- **A complete walk.** The longest live run reached two pages and 40
  offers, all 40 with distinct article ids, 39 of 40 with a product id,
  every one priced and graded — and it started from page five and
  correctly went back to page one first.
