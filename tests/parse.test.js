import { test, expect, describe } from "bun:test";
import { load, parse, text, MKM } from "./helpers.js";
import { Window } from "happy-dom";

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
    // The upload reads nothing from the language column yet, so a foreign
    // printing is valued as the English one. Dropping those quietly would
    // hide cards the person owns; the count is said instead, and the row is
    // theirs to keep or discard.
    expect(byArticle["2058744495"].language).toBe("7");
    expect(byArticle["2058737078"].language).toBe("1");
    expect(byArticle["2058744495"].languageName).toBe("Japanese");
    expect(byArticle["2058737078"].languageName).toBe("English");
  });

  test("a listing naming no language reports none", () => {
    expect(byArticle["2057222480"].language).toBe("");
    expect(byArticle["2057222480"].languageName).toBe("");
  });

  test("an id the table has not met takes the page's own word for it", () => {
    expect(MKM.languageName("12", { English: "1", Polish: "12" })).toBe("Polish");
    expect(MKM.languageName("12", { English: "1" })).toBe("");
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

describe("the way back to the offer", () => {
  const BASE = "https://www.cardmarket.com/en/Magic/Users/Seller/Offers/Singles";

  function filter() {
    const window = new Window();
    window.document.body.innerHTML = text("expansion-filter.html");
    return MKM.expansionIDs(window.document);
  }

  test("the page's own filter says what an expansion's id is", () => {
    // The row carries no number: it links to /Expansions/<slug> and names
    // the set in a tooltip. The filter beside the table is where the id
    // the offers page would use lives.
    const ids = filter();
    expect(ids["Wilds of Eldraine"]).toBe("5359");
    expect(ids["The List"]).toBe("3494");
  });

  test("a count belongs to the seller, not to the name", () => {
    // "The List (60)" is sixty of the seller's cards, not an expansion
    // called that.
    const ids = filter();
    expect(ids["The List (60)"]).toBeUndefined();
    // Listed twice, with the count and without, and the same id both ways.
    expect(ids["Wilds of Eldraine"]).toBe("5359");
    // And one that never carried a count reads the same way.
    expect(ids["Fourth Edition"]).toBe("10");
  });

  test("names keep their own punctuation", () => {
    expect(filter()["Universes Beyond: Assassin's Creed"]).toBe("5655");
    expect(filter()["The Lord of the Rings: Tales of Middle-earth"]).toBe("5285");
  });

  test("a page with no filter on it says nothing rather than guessing", () => {
    const window = new Window();
    window.document.body.innerHTML = "<p>no filters here</p>";
    expect(MKM.expansionIDs(window.document)).toEqual({});
  });

  test("a link is the seller's list narrowed to the one offer", () => {
    // Every part of this was asked of the live site and came back with
    // exactly one row.
    const url = MKM.offerURL(
      BASE,
      { cardName: "A Tale for the Ages", expansionName: "Wilds of Eldraine", foil: "" },
      filter()
    );
    expect(url).toBe(
      BASE +
        "?name=A%20Tale%20for%20the%20Ages&idExpansions=5359" +
        "&isFoil=N&isSigned=N&isAltered=N&sortBy=name_asc" +
        "&utm_source=MTGBAN&utm_medium=text&utm_campaign=card_prices"
    );
  });

  test("the attribution goes last, behind everything that picks the offer", () => {
    // It says where the visit came from. A filter decides which row is
    // there to be visited, and those come first for that reason.
    const url = MKM.offerURL(BASE, { cardName: "X" }, {});
    expect(url.indexOf("utm_source")).toBeGreaterThan(url.indexOf("sortBy"));
    expect(url.endsWith("&utm_source=MTGBAN&utm_medium=text&utm_campaign=card_prices")).toBe(true);
  });

  test("accents, commas and a version suffix survive the trip", () => {
    const url = MKM.offerURL(BASE, { cardName: "Adéwalé, Breaker of Chains (V.1)" }, {});
    expect(url).toContain("name=Ad%C3%A9wal%C3%A9%2C%20Breaker%20of%20Chains%20(V.1)");
  });

  test("a foil says so, and a language says so when the row knew one", () => {
    const foil = MKM.offerURL(BASE, { cardName: "X", foil: "foil", language: "5" }, {});
    expect(foil).toContain("isFoil=Y");
    expect(foil).toContain("idLanguages=5");
    const plain = MKM.offerURL(BASE, { cardName: "X" }, {});
    expect(plain).toContain("isFoil=N");
    expect(plain).not.toContain("idLanguages");
  });

  test("an expansion the filter does not name is left out, not guessed", () => {
    // A filter left off widens the list by a step. One guessed at hides
    // the row the link exists to reach.
    const url = MKM.offerURL(BASE, { cardName: "X", expansionName: "Nowhere" }, filter());
    expect(url).not.toContain("idExpansions");
  });

  test("a row with no name has no way back", () => {
    expect(MKM.offerURL(BASE, { cardName: "" }, {})).toBe("");
    expect(MKM.offerURL("", { cardName: "X" }, {})).toBe("");
  });
});

describe("the language a listing is in", () => {
  function unfiltered() {
    const window = new Window();
    window.document.body.innerHTML = text("offers-unfiltered.html");
    return window.document;
  }

  test("the page's own filter says which id a language has", () => {
    const ids = MKM.languageIDs(unfiltered());
    expect(ids["Italian"]).toBe("5");
    expect(ids["English"]).toBe("1");
    expect(ids["Japanese"]).toBe("7");
  });

  test("a row on an unfiltered page still knows its language", () => {
    // The product link carries ?language= only once a page has been
    // filtered by one. Every ordinary page used to parse as language-less,
    // so a seller with 828 Italian cards reported none.
    const doc = unfiltered();
    expect(doc.querySelector('a[href*="/Products/"]').getAttribute("href")).not.toContain("language=");

    const [offer] = MKM.parseOffers(doc, MKM.languageIDs(doc));
    expect(offer.language).toBe("5");
    expect(offer.languageName).toBe("Italian");
    expect(MKM.foreignCount([offer])).toBe(1);
  });

  test("and the rest of the row is read the same as ever", () => {
    // If this fixture were mistranscribed these are what would say so.
    const doc = unfiltered();
    const [offer] = MKM.parseOffers(doc, MKM.languageIDs(doc));
    expect(offer.cardName).toBe("A Tale for the Ages");
    expect(offer.expansionName).toBe("Wilds of Eldraine");
    expect(offer.condition).toBe("NM");
    expect(offer.price).toBe("0.10");
    expect(offer.mcmID).toBe("729023");
  });

  test("the row's other tooltips are not mistaken for a language", () => {
    // A row carries its expansion, rarity and condition as tooltips too,
    // and nothing in the markup distinguishes them - so a filter that
    // does not list this row's language must come back with nothing
    // rather than with "Near Mint".
    const doc = unfiltered();
    const [offer] = MKM.parseOffers(doc, { English: "1", Japanese: "7" });
    expect(offer.language).toBe("");
  });

  test("without a filter it says nothing rather than guessing", () => {
    const [offer] = MKM.parseOffers(unfiltered());
    expect(offer.language).toBe("");
  });

  test("a filtered page still reads the language off the link", () => {
    // Where Cardmarket does say it outright, that is what is used.
    const offers = MKM.parseOffers(load("offers.html"), { Italian: "5" });
    expect(offers.some((o) => o.language === "1")).toBe(true);
    expect(offers.some((o) => o.language === "7")).toBe(true);
  });
});
