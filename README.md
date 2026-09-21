# cm-banner

A browser extension that reads the offers listed on a Cardmarket page and
writes them out as a CSV [mtgban](https://www.mtgban.com)'s `/upload` page can
read.

The parsing happens in the browser. Your cards are not sent anywhere by this
extension: it fills the upload form on your own tab, or hands you a file, and
you decide whether to submit it.

## What it does

On a seller's offers page — `cardmarket.com/<lang>/<Game>/Users/<seller>/Offers/…`
— a panel appears in the bottom right saying how many offers it can see. It
offers two things:

- **Send to BAN** opens that game's own upload page with the rows already in
  the form, for you to look over and submit.
- **CSV** downloads `mkm-<game>-<date>.csv` instead.

Either way it reports how many rows it took, how many it skipped, and how many
it could not price.

It reads singles and sealed alike: Cardmarket files boxes and bundles under
their own product categories, and the upload tells one from the other by what
the id resolves to.

It works on all seven games Cardmarket sells: Magic, Pokemon, YuGiOh, Lorcana,
One Piece, Flesh and Blood and Riftbound.

## The CSV

```
mcm_id,card_name,edition,condition,foil,quantity,price_usd,article_id
10601,Thornwind Faeries,Urzas Legacy,MP,,1,0.06,2058737078
765432,Bloomburrow Play Booster Box,Bloomburrow,,,1,263.87,2060000001
,Mirri's Guile,Zendikar,PO,,1,,2057222480
```

`mcm_id` is the Cardmarket product id, taken from the product image's own file
name, which the site resolves straight to a card. When a row carries none — as
the third one above does — the upload falls back to matching on `card_name` and
`edition`, so the row still lands. That fallback is why the slugs losing their
punctuation does not matter: `Urzas Legacy` and `Tolsimir Friend to Wolves`
both normalize on the way in.

`article_id` is the offer's own id on Cardmarket. The site ignores it; it is
carried so a row can be traced back to the listing it came from.

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

The panel exports English listings by default, because the CSV has no language
column and the upload matches what it is given as English — a German printing
exported unmarked would be priced as the English one. Unticking *English only*
exports every language on the page; the panel says how many rows the filter
cost either way.

A listing whose link names no language is kept under either setting, since
there is nothing to hold it against.

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
knows the cards: a Magic offers page opens `magic.mtgban.com/upload`, a Lorcana
one `lorcana.mtgban.com/upload`, and so on for the seven.

They are **not** posted there. The upload needs your session, and the site's
cookie is same-site, so a request made from cardmarket.com would arrive without
it and be refused. So the page does its own upload, from its own origin, with
its own session — the extension only puts the rows in front of it.

It does that by handing the page a **file**, as though one had been picked from
disk: the CSV becomes a `File` on the page's own file input. That is the path
the page is built around — its input carries a handler that names the file on
screen, clears the other sources, and enables the submit buttons, which start
disabled. Filling the textarea instead sets a value the page never hears about
and leaves Upload greyed out.

The upload page is opened by the click that asks for it, so the two windows can
speak: the upload page says when it is listening, and the rows are passed to
that window and no other. Both ends check who they are talking to — the
Cardmarket tab accepts only the window it opened at the host it opened, and the
upload page accepts only `https://www.cardmarket.com` from its opener.

Nothing is submitted for you. The page's own Upload button is left for you to
press, because sending a collection off to be valued is your decision.

## Permissions

None. There is no background script, no storage, and no `tabs` permission —
the upload page is opened by your own click, and the rows travel between the
two windows directly.

The extension runs on two hosts: Cardmarket sellers' offers pages, and
`*.mtgban.com/upload`. It reaches the network once per export, for the
exchange-rate feed on jsDelivr, and sends nothing with that request.

## Limitations

It exports **the offers on the page you are looking at**. Cardmarket paginates,
so a large list needs exporting a page at a time and the files concatenating.

It reads Cardmarket's current markup. A redesign would break it, and the honest
failure is visible rather than silent: the panel reports either "No offers on
this page" or "None of the N offers here could be read", and the second of
those means the markup moved.

## The icon

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

`demo/index.html` loads that same fixture and the real content script, so the
panel on it is the one the extension injects. Serve it over HTTP:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/demo/`.
