# cm-banner

A browser extension that reads the offers listed on a Cardmarket page and
writes them out as a CSV [mtgban](https://www.mtgban.com)'s `/upload` page can
read.

The parsing happens in the browser. Nothing is sent anywhere: the extension
produces a file, you look at it, and you upload it yourself if you want to.

## What it does

On any Cardmarket page that lists offers, a panel appears in the bottom right
saying how many it can see. Clicking it downloads `mkm-<game>-<date>.csv` and
reports how many rows were exported and how many were skipped.

It works on all seven games Cardmarket sells: Magic, Pokemon, YuGiOh, Lorcana,
One Piece, Flesh and Blood and Riftbound.

## The CSV

```
mcm_id,card_name,edition,condition,foil,quantity,article_id
10601,Thornwind Faeries,Urzas Legacy,NM,,3,2058737078
401749,Tuinvale Treefolk Oaken Boon,Throne of Eldraine Extras,SP,foil,1,2051859187
,Mirri's Guile,Zendikar,PO,,1,2057222480
```

`mcm_id` is the Cardmarket product id, taken from the product image's own file
name, which the site resolves straight to a card. When a row carries none — as
the third one above does — the upload falls back to matching on `card_name` and
`edition`, so the row still lands. That fallback is why the slugs losing their
punctuation does not matter: `Urzas Legacy` and `Tolsimir Friend to Wolves`
both normalize on the way in.

`article_id` is the offer's own id on Cardmarket. The site ignores it; it is
carried so a row can be traced back to the listing it came from.

**There is no price column, deliberately.** The upload compares a price it is
given against mtgban's own, which are dollars, and every price on Cardmarket is
euros. A price column here would be read as the currency it is not, and a
valuation wrong by an exchange rate is worse than one the site works out for
itself.

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

## Permissions

None beyond running on Cardmarket's own pages. There is no background script,
no storage, no network access, and no extension API call anywhere in the code —
the parse is a DOM read and the download is a blob and an anchor, both plain
web platform. That is also why one build runs unchanged on all three browsers.

## Limitations

It exports **the offers on the page you are looking at**. Cardmarket paginates,
so a large list needs exporting a page at a time and the files concatenating.

It reads Cardmarket's current markup. A redesign would break it, and the honest
failure is visible rather than silent: the panel reports either "No offers on
this page" or "None of the N offers here could be read", and the second of
those means the markup moved.

## Development

```
bun install
bun test tests/
```

The suite runs the real content scripts against a DOM (`happy-dom`) and a
fixture shaped like a saved Cardmarket page, covering both tooltip spellings,
the condition fold, the language filter, the skip rules, the id falling back to
empty, and the CSV's own quoting. It runs in CI on every push and pull request.

`demo/index.html` loads that same fixture and the real content script, so the
panel on it is the one the extension injects. Serve it over HTTP:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/demo/`.
