import { test, expect, describe } from "bun:test";
import { load, parse } from "./helpers.js";

const doc = load("offers.html");
const offers = parse(doc);
const byArticle = Object.fromEntries(offers.map((o) => [o.articleID, o]));

describe("what the page holds", () => {
  test("every stockRow is counted, repeats included", () => {
    expect(globalThis.MKM.countRows(doc)).toBe(14);
  });

  test("a row is kept once, and only when it names a product", () => {
    // 14 rows, less the signed one, the repeat and the one with no link.
    expect(offers.length).toBe(11);
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

  test("the name is the link's own text, not the slug", () => {
    // The slug is what survived being made URL-safe; the link says the name.
    expect(byArticle["2051859187"].cardName).toBe(
      "Tuinvale Treefolk // Oaken Boon (V.2)"
    );
  });

  test("a ligature the slug dropped is still in the name", () => {
    // Cardmarket slugs this one "-ther-Tide": read from there it would begin
    // with the space that dash became.
    expect(byArticle["2058750013"].cardName).toBe("Aether Tide");
  });

  test("accents and commas survive", () => {
    expect(byArticle["2052873049"].cardName).toBe(
      "Ad\u00e9wal\u00e9, Breaker of Chains (V.1)"
    );
  });

  test("the slug is still the fallback when a link says nothing", () => {
    expect(globalThis.MKM.slugToName("Mirri-s-Guile")).toBe("Mirri's Guile");
    expect(globalThis.MKM.slugToName("Sorcerous-Spyglass-V2")).toBe(
      "Sorcerous Spyglass"
    );
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

describe("the language a listing is in", () => {
  test("it is reported, not filtered on", () => {
    // The CSV has no language column and the upload has nothing to read one
    // into, so a foreign printing is valued as the English one. Dropping
    // those quietly would hide cards the person owns; the count is said
    // instead, and the row is theirs to keep or discard.
    expect(byArticle["2058744495"].language).toBe("7");
    expect(byArticle["2058737078"].language).toBe("1");
  });

  test("a listing naming no language reports none", () => {
    expect(byArticle["2057222480"].language).toBe("");
  });

  test("foreignCount counts what the upload would misread", () => {
    // The Japanese one. A listing naming no language is not counted: there
    // is nothing to say it is not English.
    expect(globalThis.MKM.foreignCount(offers)).toBe(1);
    expect(globalThis.MKM.foreignCount([])).toBe(0);
  });
});

describe("what is not a single", () => {
  test("a sealed product is an offer like any other", () => {
    // Cardmarket files sealed under its own category rather than Singles,
    // and the upload tells it from a card by what the id resolves to, so
    // the parse only has to let it through.
    const box = byArticle["2036785656"];
    expect(box.mcmID).toBe("565902");
    expect(box.cardName).toBe("Adventures in the Forgotten Realms Set Booster");
    // Filed under its category with no set segment: the set is part of what
    // the product is called, so there is no separate edition to give.
    expect(box.edition).toBe("");
  });

  test("a box has no grade, and none is invented for it", () => {
    expect(byArticle["2036785656"].condition).toBe("");
  });
});

describe("the price as the page wrote it", () => {
  test("a decimal comma is read as a decimal point", () => {
    expect(byArticle["2036785656"].price).toBe("10.00");
    expect(byArticle["2036785656"].currency).toBe("eur");
  });

  test("a grouped thousand is not read as a decimal", () => {
    expect(byArticle["2060000002"].price).toBe("1250.00");
    expect(byArticle["2060000002"].currency).toBe("gbp");
  });

  test("a quantity beside the price is not part of it", () => {
    // The row reads "1" then "0,05 EUR"; flattened that is "10,05 EUR".
    expect(byArticle["2060000003"].price).toBe("0.05");
    expect(byArticle["2060000003"].currency).toBe("eur");
  });

  test("a row showing no price carries none", () => {
    expect(byArticle["2058743685"].price).toBe("");
    expect(byArticle["2058743685"].currency).toBe("");
  });
});
