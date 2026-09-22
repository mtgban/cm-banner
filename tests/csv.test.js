import { test, expect, describe } from "bun:test";
import { load, parse, MKM } from "./helpers.js";
import { readFileSync } from "fs";

describe("the columns", () => {
  // Every name here is one the upload's header matcher reads, and reads the
  // way it should: card_name reaches the name rather than the edition, foil
  // reaches the printing column, mcm_id reaches the Cardmarket id, and
  // mkm_notes reaches the notes field the results render the loaded price's
  // link from. article_id reaches nothing, which is why it is safe to carry.
  test("the header is the contract", () => {
    expect(MKM.csvColumns().join(",")).toBe(
      "mcm_id,card_name,edition,condition,foil,quantity,price_usd,article_id,mkm_notes"
    );
  });

  test("exactly one column is read as a price, and it names its currency", () => {
    // The upload reads a price column as dollars. Exactly one column may
    // reach it, and its name has to say which currency it holds, because
    // Cardmarket quotes euros and pounds.
    const priced = MKM.csvColumns().filter(
      (name) => name.includes("price") || name.includes("low")
    );
    expect(priced).toEqual(["price_usd"]);
  });
});

describe("the writing", () => {
  test("a comma, a quote and a newline are quoted", () => {
    const csv = MKM.toCSV([
      {
        mcmID: "1",
        cardName: 'Bob, the "Builder"',
        edition: "Set\nTwo",
        condition: "NM",
        foil: "",
        quantity: "2",
        priceUSD: "1.50",
        articleID: "9",
        url: "https://www.cardmarket.com/en/Magic/Users/S/Offers/Singles?name=Bob",
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      '1,"Bob, the ""Builder""","Set\nTwo",NM,,2,1.50,9,' +
        "https://www.cardmarket.com/en/Magic/Users/S/Offers/Singles?name=Bob"
    );
  });

  test("a row whose price could not be converted carries an empty one", () => {
    const csv = MKM.toCSV([
      { mcmID: "1", cardName: "X", quantity: "1", articleID: "9" },
    ]);
    expect(csv.split("\r\n")[1]).toBe("1,X,,,,1,,9,");
  });

  test("the last row ends like every other one", () => {
    expect(MKM.toCSV([]).slice(-2)).toBe("\r\n");
  });

  test("an empty export is still a header", () => {
    expect(MKM.toCSV([]).trim()).toBe(MKM.csvColumns().join(","));
  });
});

describe("end to end", () => {
  test("the fixture writes the rows it parsed", () => {
    const offers = parse(load("offers.html"));
    const lines = MKM.toCSV(offers).trimEnd().split("\r\n");
    expect(lines.length).toBe(offers.length + 1);
    // No rates were fetched here, so the price stays empty - the row is
    // still worth uploading without the seller's asking price.
    // No base was given to offerURL here, so the way back is empty - the
    // same shape a row takes when the page cannot be named.
    expect(lines[1]).toBe(
      "10601,Thornwind Faeries,Urzas Legacy,NM,,3,,2058737078,"
    );
  });
});

describe("where the extension runs", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
  );

  test("only on a seller's offers pages, and nowhere else", () => {
    // The site receives its own rows now, on a page it owns, so this runs on
    // Cardmarket and has no business anywhere else. A host creeping back in
    // is a permission creeping back in.
    expect(manifest.content_scripts.length).toBe(1);
    const hosts = manifest.content_scripts[0].matches;
    expect(hosts.every((m) => m.startsWith("https://www.cardmarket.com/"))).toBe(true);
    expect(hosts.every((m) => m.includes("/Users/*/Offers/"))).toBe(true);
  });

  test("on every game Cardmarket sells, and naming none of them", () => {
    // It used to name the seven BAN prices, and refuse to appear on any
    // other. The read and the file are the same work on all of them, so
    // the panel is worth having everywhere and only the send is held back
    // - which `tests/panel.test.js` is where to see. Naming games here as
    // well would be a second list to keep in step with `HOSTS`, and the
    // two drifting is a page the extension silently never loads on.
    const matches = manifest.content_scripts[0].matches;
    expect(matches.length).toBe(1);

    const pattern = new RegExp(
      "^" + matches[0].replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
    );
    const offers = (game) =>
      "https://www.cardmarket.com/en/" + game + "/Users/Seller/Offers/Singles";
    for (const game of ["Magic", "Pokemon", "Digimon", "StarWarsUnlimited"]) {
      expect(pattern.test(offers(game))).toBe(true);
    }
    // Every game, still only the one kind of page.
    expect(
      pattern.test("https://www.cardmarket.com/en/Magic/Products/Singles/Sol-Ring")
    ).toBe(false);
    expect(pattern.test("https://www.cardmarket.com/en/Magic/Users/Seller")).toBe(
      false
    );
  });

  test("and asks for no permissions at all", () => {
    expect(manifest.permissions).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.background).toBeUndefined();
    // Nor does it hand any of its own files to the pages it runs on. The
    // panel's mark is inlined in the stylesheet for exactly this reason.
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});
