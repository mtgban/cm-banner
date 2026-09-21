import { test, expect, describe } from "bun:test";
import { load, parse } from "./helpers.js";

const doc = load("offers.html");
const offers = parse(doc, "");
const byArticle = Object.fromEntries(offers.map((o) => [o.articleID, o]));

describe("what the page holds", () => {
  test("every stockRow is counted, repeats included", () => {
    expect(globalThis.MKM.countRows(doc)).toBe(9);
  });

  test("a row is kept once, and only when it names a product", () => {
    // 9 rows, less the signed one, the repeat and the one with no link.
    expect(offers.length).toBe(6);
  });

  test("a signed listing is refused", () => {
    expect(byArticle["2058745758"]).toBeUndefined();
  });

  test("a row naming no product is refused", () => {
    expect(byArticle["2058699166"]).toBeUndefined();
  });
});

describe("the fields a row gives up", () => {
  test("the id is the image's file name", () => {
    expect(byArticle["2058737078"].mcmID).toBe("10601");
  });

  test("a row with no image has no id, and says so with an empty one", () => {
    expect(byArticle["2057222480"].mcmID).toBe("");
  });

  test("the slug's apostrophe comes back", () => {
    expect(byArticle["2057222480"].cardName).toBe("Mirri's Guile");
  });

  test("a version suffix is not part of the name", () => {
    expect(byArticle["2051859187"].cardName).toBe("Tuinvale Treefolk Oaken Boon");
  });

  test("the edition is the slug with its dashes opened up", () => {
    expect(byArticle["2058737078"].edition).toBe("Urzas Legacy");
  });

  test("quantity is read, and defaults to one when the page shows none", () => {
    expect(byArticle["2058737078"].quantity).toBe("3");
    expect(byArticle["2057222480"].quantity).toBe("1");
  });

  test("a finish is read from either spelling of the tooltip", () => {
    expect(byArticle["2051859187"].foil).toBe("foil");
    expect(byArticle["2058737078"].foil).toBe("");
  });
});

describe("the condition fold", () => {
  // go-mtgban's own Cardmarket scraper (cardmarket/market.go, mkmCondition)
  // folds seven grades onto five: MT/NM > NM, EX > SP, GD > MP, LP/PL > HP,
  // PO > PO. Both played grades land on HP. Writing Light Played as MP
  // would hand the upload a better card than the seller listed, and the
  // upload trusts what it is given.
  test("Near Mint is NM", () => {
    expect(byArticle["2058737078"].condition).toBe("NM");
  });

  test("Excellent is SP", () => {
    expect(byArticle["2051859187"].condition).toBe("SP");
  });

  test("Good is MP, and is the only grade that is", () => {
    expect(byArticle["2058743685"].condition).toBe("MP");
  });

  test("Light Played is HP, not MP", () => {
    expect(byArticle["2058725535"].condition).toBe("HP");
  });

  test("Poor is PO", () => {
    expect(byArticle["2057222480"].condition).toBe("PO");
  });
});

describe("the language filter", () => {
  test("English alone leaves the Japanese listing behind", () => {
    const english = parse(doc, "1");
    expect(english.some((o) => o.articleID === "2058744495")).toBe(false);
  });

  test("a row naming no language is not guessed at", () => {
    // The Mirri's Guile row carries no language query, so a filter has
    // nothing to hold it against and it stays.
    const english = parse(doc, "1");
    expect(english.some((o) => o.articleID === "2057222480")).toBe(true);
  });

  test("no filter keeps every language", () => {
    expect(offers.some((o) => o.articleID === "2058744495")).toBe(true);
  });
});
