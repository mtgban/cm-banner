import { test, expect, describe } from "bun:test";
import { MKM } from "./helpers.js";

// The feed quotes what one dollar buys, so a price coming the other way is
// divided by that. go-mtgban reads the same feed the same way
// (mtgban/utils.go, GetExchangeRates).
const FEED = { usd: { eur: 0.87127422, gbp: 0.74720776, zzz: 0, usd: 1 } };

describe("reading the feed", () => {
  test("a quote is inverted into the multiplier a price needs", () => {
    const rates = MKM.toRates(FEED);
    expect(rates.eur).toBeCloseTo(1 / 0.87127422, 8);
    expect(rates.gbp).toBeCloseTo(1 / 0.74720776, 8);
  });

  test("a currency quoted at zero is left out, not kept as an infinity", () => {
    // Converting by an infinity would invent a price; a missing entry omits
    // one, which is the honest answer.
    const rates = MKM.toRates(FEED);
    expect(rates.zzz).toBeUndefined();
    expect(Object.values(rates).every(Number.isFinite)).toBe(true);
  });

  test("an empty or broken payload yields no rates but does not throw", () => {
    expect(MKM.toRates(null)).toEqual({ usd: 1 });
    expect(MKM.toRates({})).toEqual({ usd: 1 });
  });
});

describe("naming the currency", () => {
  test("the symbols Cardmarket prices in", () => {
    expect(MKM.currencyOf("0,45 €")).toBe("eur");
    expect(MKM.currencyOf("£1.20")).toBe("gbp");
    expect(MKM.currencyOf("$3.00")).toBe("usd");
  });

  test("text with no symbol names no currency", () => {
    expect(MKM.currencyOf("1.20")).toBe("");
    expect(MKM.currencyOf("")).toBe("");
    expect(MKM.currencyOf(null)).toBe("");
  });
});

describe("converting", () => {
  const rates = MKM.toRates(FEED);

  test("euros become dollars", () => {
    // 0.45 EUR at 1 USD = 0.87127422 EUR
    expect(MKM.priceUSD("0.45", "eur", rates)).toBe("0.52");
  });

  test("pounds become dollars", () => {
    expect(MKM.priceUSD("10.00", "gbp", rates)).toBe("13.38");
  });

  test("dollars are left alone", () => {
    expect(MKM.priceUSD("3.00", "usd", rates)).toBe("3.00");
  });

  test("anything that cannot be converted honestly converts to nothing", () => {
    expect(MKM.priceUSD("1.00", "eur", null)).toBe("");
    expect(MKM.priceUSD("1.00", "", rates)).toBe("");
    expect(MKM.priceUSD("1.00", "xyz", rates)).toBe("");
    expect(MKM.priceUSD("", "eur", rates)).toBe("");
    expect(MKM.priceUSD("not a number", "eur", rates)).toBe("");
  });
});
