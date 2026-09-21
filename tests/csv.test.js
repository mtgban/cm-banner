import { test, expect, describe } from "bun:test";
import { load, parse, MKM } from "./helpers.js";
import { readFileSync } from "fs";

describe("the columns", () => {
  // Every name here is one the upload's header matcher reads, and reads the
  // way it should: card_name reaches the name rather than the edition, foil
  // reaches the printing column, mcm_id reaches the Cardmarket id, and
  // article_id reaches nothing, which is why it is safe to carry.
  test("the header is the contract", () => {
    expect(MKM.csvColumns().join(",")).toBe(
      "mcm_id,card_name,edition,condition,foil,quantity,price_usd,article_id"
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
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      '1,"Bob, the ""Builder""","Set\nTwo",NM,,2,1.50,9'
    );
  });

  test("a row whose price could not be converted carries an empty one", () => {
    const csv = MKM.toCSV([
      { mcmID: "1", cardName: "X", quantity: "1", articleID: "9" },
    ]);
    expect(csv.split("\r\n")[1]).toBe("1,X,,,,1,,9");
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
    expect(lines[1]).toBe(
      "10601,Thornwind Faeries,Urzas Legacy,NM,,3,,2058737078"
    );
  });
});

describe("where the extension runs", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
  );
  const upload = manifest.content_scripts.find((cs) =>
    cs.matches.some((m) => m.includes("mtgban"))
  );

  test("the upload half covers the bare domain as well as a subdomain", () => {
    // Magic is the default deployment and answers at mtgban.com;
    // magic.mtgban.com redirects there. Matching only "*.mtgban.com" leans on
    // a reading of the pattern spec, and the bare domain is the one game most
    // people will try first.
    expect(upload.matches).toContain("https://mtgban.com/upload*");
    expect(upload.matches).toContain("https://*.mtgban.com/upload*");
  });

  test("the Cardmarket half stays on sellers' offers pages", () => {
    const offers = manifest.content_scripts.find((cs) =>
      cs.matches.some((m) => m.includes("cardmarket"))
    );
    expect(offers.matches.every((m) => m.includes("/Users/*/Offers/"))).toBe(true);
  });
});
