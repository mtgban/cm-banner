import { test, expect, describe } from "bun:test";
import { load, parse, MKM } from "./helpers.js";

describe("the columns", () => {
  // Every name here is one the upload's header matcher reads, and reads the
  // way it should: card_name reaches the name rather than the edition, foil
  // reaches the printing column, mcm_id reaches the Cardmarket id, and
  // article_id reaches nothing, which is why it is safe to carry.
  test("the header is the contract", () => {
    expect(MKM.csvColumns().join(",")).toBe(
      "mcm_id,card_name,edition,condition,foil,quantity,article_id"
    );
  });

  test("no column would be read as a price", () => {
    // The upload compares a price it is given against mtgban's own, which
    // are dollars, and every price on Cardmarket is euros. A column the
    // matcher reads as a price would be read as the wrong currency, so
    // there is not one.
    for (const name of MKM.csvColumns()) {
      expect(name.includes("price")).toBe(false);
      expect(name.includes("low")).toBe(false);
    }
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
        articleID: "9",
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      '1,"Bob, the ""Builder""","Set\nTwo",NM,,2,9'
    );
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
    const offers = parse(load("offers.html"), "");
    const lines = MKM.toCSV(offers).trimEnd().split("\r\n");
    expect(lines.length).toBe(offers.length + 1);
    expect(lines[1]).toBe("10601,Thornwind Faeries,Urzas Legacy,NM,,3,2058737078");
  });
});
