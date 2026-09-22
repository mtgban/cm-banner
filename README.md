# cm-banner

A browser extension that reads the offers listed on a Cardmarket page and
writes them out as a CSV [mtgban](https://www.mtgban.com)'s `/upload` page can
read.

The parsing happens in the browser. Your cards are not sent anywhere by this
extension: it fills the upload form on your own tab, or hands you a file, and
you decide whether to submit it.

## What it does

On a seller's offers page — `cardmarket.com/<lang>/<Game>/Users/<seller>/Offers/…`
— a panel appears in the bottom right. It appears only for a game BAN prices; on any other there is nowhere to send the
rows, so there is no panel either.

**Escape** stops a read and puts the panel back — spinner off, buttons back,
nothing kept. A read that was stopped half way is not a shorter export, so its
rows go with it. The key does nothing when there is nothing of ours running.

While it is reading, the page asks before it goes anywhere — a link, the back
button, a reload. The read lives in the page, so leaving throws it away, and
after a minute of waiting that is worth a confirmation. The wording is your
browser's own; pages have not been able to choose it for years.

It sees the seller's **whole list**, not the twenty rows on screen. Cardmarket
paginates at twenty, and the export follows the pager from the first page to
the last, whichever page you happened to be looking at. That is one request per
page and deliberately unhurried, so the heading counts up while it works — a
spinner takes the place of the scope word and the line reads `CM BANNER -
140 / 251`.

It goes there rather than on a line of its own because the panel does not
change size while it reads. It sits under the cursor, and every pixel it grew
would drag a button out from under it; a line kept permanently empty for a
count that is only there some of the time is the same problem paid for in
advance.

It offers two things:

- **Send to BAN** opens that game's own upload page, hands it the rows, and
  lets it price them.
- **CSV** downloads `mkm-<game>-<date>.csv` instead.

Both take whatever the panel's heading says. It reads **CM BANNER - *all offers***; click
it and it reads **CM BANNER - *this page only***, which restricts both buttons to the twenty
rows in front of you — instant, and what you want when the page in front of you
is what you meant. Hovering it says how many offers are listed.

The button carries the count once the rows are read, so a line appears under it
only for what the count does not say: what was skipped, what will be valued as
something it is not, what is missing from the list. Usually nothing does, and
then there is no line.

It reads singles and sealed alike: Cardmarket files boxes and bundles under
their own product categories, and the upload tells one from the other by what
the id resolves to.

It works on all seven games Cardmarket sells: Magic, Pokemon, YuGiOh, Lorcana,
One Piece, Flesh and Blood and Riftbound.

## The CSV

```
mcm_id,card_name,edition,condition,foil,quantity,price_usd,article_id,mkm_notes
10601,Thornwind Faeries,Urzas Legacy,MP,,1,0.06,2058737078,https://...
765432,Bloomburrow Play Booster Box,Bloomburrow,,,1,263.87,2060000001,https://...
,Mirri's Guile,Zendikar,PO,,1,,2057222480,https://...
```

`mcm_id` is the Cardmarket product id, taken from the product image's own file
name, which the site resolves straight to a card. A row whose thumbnail has not
loaded carries none — it happens — and the upload falls back to matching on
`card_name` and `edition`, so the row still lands.

`card_name` is the name the listing's own link displays, not the slug it points
at. A slug is what survived being made URL-safe: Cardmarket writes
`Adéwalé, Breaker of Chains` as `Adewale-Breaker-of-Chains`, and drops the
ligature from `Æther Tide` outright, leaving `-ther-Tide` — a name that begins
with the space that dash becomes. The link's text keeps the accents, the
commas and the colons.

`edition` still comes from the slug, which loses punctuation the same way
(`Urzas Legacy`); that one is harmless, because the matcher normalizes it.

`article_id` is the offer's own id on Cardmarket. The site ignores it; it is
carried so a row can be traced back to the listing it came from.

`mkm_notes` is the way back to it: the seller's own list, narrowed by the offers
page's own filters to that one card — by name, by expansion, by foil. The
expansion id is read off the filter dropdown beside the table, since the row
itself only names the set in words. Each filter is added only when it is known,
because one left off widens the list by a step while one guessed at hides the
offer the link exists to reach.

`price_usd` is the seller's asking price, converted. The upload holds a price
it is given against mtgban's own, and those are dollars, while Cardmarket
quotes euros or pounds — so the column has to be in the currency it will be
read as. The rate comes from the same feed go-mtgban reads
(`mtgban/utils.go`), fetched once per export.

A row whose price could not be converted honestly — no rate, an unfamiliar
currency, an unreadable number — carries an **empty** price rather than a
guess, and the panel says how many. The rest of the row still uploads.

### Conditions

Cardmarket grades on seven levels and mtgban on five, so two of them fold. The
mapping is the one go-mtgban's own Cardmarket scraper uses
(`cardmarket/market.go`, `mkmCondition`):

| Cardmarket | | mtgban |
| --- | --- | --- |
| Mint, Near Mint | → | NM |
| Excellent | → | SP |
| Good | → | MP |
| Light Played, Played | → | HP |
| Poor | → | PO |

Both played grades land on HP. Calling Light Played `MP` would hand the upload
a better card than the seller listed, and the upload trusts what it is given.

Rows for cards marked Altered, Signed or Inked are skipped: they are not the
printing the catalog knows, and no id names them.

### Language

Every listing on the page is exported, whatever language it is in, and the
panel says how many are not English — `20 rows, 3 non-English`.

It is reported rather than filtered on because neither answer is good. The CSV
has no language column and the upload has nothing to read one into, so a German
printing is valued as the English one, at a price asked for a different card.
Dropping those quietly would hide cards you own from your own valuation, so
they are exported and counted instead, and what to do about them is yours to
decide.

A listing whose link names no language is not counted: there is nothing saying
it is not English.

Making this properly correct means a language column on the upload side,
mapping Cardmarket's language ids onto the matcher's own `Language` field.

## Installing it

The same unpacked folder works in all three browsers.

**Chrome** — `chrome://extensions`, turn on Developer mode, *Load unpacked*,
pick this folder.

**Firefox** — `about:debugging#/runtime/this-firefox`, *Load Temporary Add-on*,
pick `manifest.json`. Firefox drops a temporary add-on when it restarts, so
this needs redoing each session.

**Safari** — Safari runs the same extension but wants an app around it, which
needs Xcode:

```
xcrun safari-web-extension-converter .
```

Run the generated project once, then enable the extension in Safari's settings.
For an unsigned build, Safari's Develop menu has to have *Allow Unsigned
Extensions* turned on, which Safari resets when it quits.

## Send to BAN

Each game is served by its own deployment, so the rows go to the upload that
knows the cards: a Lorcana offers page opens `lorcana.mtgban.com`, a Pokemon
one `pokemon.mtgban.com`, and so on. Magic is the exception — it is the default
deployment and answers at `mtgban.com`, with `magic.mtgban.com` redirecting
there.

They are **not** posted there. The upload needs your session, and the site's
cookie is same-site, so a request made from cardmarket.com would arrive without
it and be refused.

Instead the site has a page for being handed a list: `/upload/handoff`. Opening
it is an ordinary navigation, so it carries your session, and it does its own
uploading. This extension opens that page and passes it the rows — it reaches
into no form of the site's own, so a redesign there is not a break here.

**CM BANNER - this page only** sends in one click. **CM BANNER - all offers**
takes two: the first reads the pages, with the count ticking along in the
heading, and leaves the heading reading *CM BANNER - 251 rows* and the button
*READY*. The second click opens the tab and hands them over.

That is not ceremony. A browser only lets a click open a window for a few
seconds afterwards, and reading a hundred pages takes minutes, so the tab has
to be opened by a click that is still warm. Doing it the other way round — tab
first, read after — means watching an empty page while the work happens in the
tab behind it.

Rows already read are kept, so pressing **CSV** afterwards writes them out
without reading anything again. They are dropped if the table changes or you
switch scope, because then they no longer describe what you are asking for.

Both ends check who they are talking to. This end accepts only the window it
opened, at an mtgban host; the site's page accepts only the origins it lists,
from the window that opened it.

## Permissions

None, and only one host. There is no background script, no storage, and no
`tabs` permission — the handoff page is opened by your own click, and the rows
travel between the two windows directly.

The extension runs on Cardmarket sellers' offers pages and nowhere else. It
reaches the network once per export, for the exchange-rate feed on jsDelivr,
and sends nothing with that request.

## Limitations

**It takes a while, and Cardmarket can stop it.** A seller with 1093 offers is
55 pages, and the walk waits about a second between them on purpose: Cardmarket
sits behind Cloudflare, and three requests inside a second are answered with a
bot challenge instead of a page. If that happens anyway the export stops, keeps
whatever it had read, and says so — reload the page, clear the check the way you
would any other, and run it again. Nothing here tries to answer that check for
you.

**Cardmarket itself stops at 100 pages.** Two thousand offers is as far as a
seller's listing will page, however much they have; the site says so by writing
`2000+ Hits` and `Page 100 of 100+`, and page 100 then ends exactly like a real
last page. The panel passes that on rather than reporting 2000 as if it were
the lot. To get at the rest, filter the seller's page — by set, by language, by
whatever — and export each slice; the walk follows whatever filter is in force.
A full hundred pages is also about two minutes of waiting.

Because the walk takes seconds, it is **not a snapshot**. If something sells
while it is running, every later offer shifts up a place: a row can be listed
twice, which is deduplicated, or missed, which cannot be. The count it reports
is what it actually read, against what the first page said to expect.

Whatever **filter** the seller's page is showing is what gets exported —
Cardmarket carries the query into its own next-page links, so a list filtered to
English exports as the filtered list.

It reads Cardmarket's current markup. A redesign would break it, and the honest
failure is visible rather than silent: the panel reports either "No offers on
this page" or "None of the N offers here could be read", and the second of
those means the markup moved.

## The icon

The panel wears a small one too, before its name, inlined into the stylesheet
as base64. A relative `url()` in an injected stylesheet resolves against the
extension's own origin, and handing that file to somebody else's page needs a
manifest declaration — three kilobytes of base64 is the cheaper of the two.

`icons/` is the BAN logo from the website — `img/logo/ban-stroop.png`, the one
the site's own home page shows. It is 128px square, which is the largest size
the browsers ask for, so `icon-128.png` is that file unchanged and the smaller
three are made from it:

```
for s in 16 32 48; do sips -Z $s icons/icon-128.png --out icons/icon-$s.png; done
```

## Development

```
bun install
bun test tests/
```

The suite runs the real content scripts against a DOM (`happy-dom`) and a
fixture shaped like a saved Cardmarket page: both tooltip spellings, the
condition fold, the language filter, the skip rules, sealed alongside singles,
the id falling back to empty, the currency conversion, and the CSV's own
quoting. It runs in CI on every push and pull request.

The fixture carries the shapes that have actually broken this parser, not just
the happy ones — a quantity written immediately before a price, which flattening
the row reads as part of the number.
