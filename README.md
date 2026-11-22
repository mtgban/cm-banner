# browser-banner

Browser extensions that read a card store's own pages and get what they
list to [mtgban](https://www.mtgban.com), as a CSV or by handing it to
mtgban's upload page. They ask for no permissions and run only on the
stores' pages.

| Store | Directory | What it reads |
|---|---|---|
| Cardmarket | [`sites/cardmarket`](sites/cardmarket) | a seller's offers |

Each store's own README says what it does and how to load it; its
SPECIFICATIONS.md says what is known about the store's markup.

[docs/single-extension-plan.md](docs/single-extension-plan.md) is the plan
for bringing Card Kingdom's and TCGplayer's extensions here and making the
three one extension.

## Testing

```
bun install
bun run test
```
