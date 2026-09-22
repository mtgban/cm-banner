# cm-banner — Specification

> Written 2026-09-22, from the work that built the extension. Every fact
> about Cardmarket's markup below was read off saved pages rather than
> inferred: two singles offers pages and one sealed one, 20 offers each.
> Where something is unverified it says so.

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

## 6. Not verified

Stated plainly so nobody takes them as tested:

- **The two-window handshake has never run in a real browser.** Both halves
  are covered by tests, but two real tabs talking to each other are not.
  `window.open` navigates in place in the browser available during
  development, so it could not be exercised there.
- **Sealed markup beyond one saved page.** One page of Boosters was read.
  Other sealed categories are assumed to share its shape.
- **Safari.** The extension is written to run there and has never been
  built for it.
