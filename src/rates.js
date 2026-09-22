// Turns the prices a Cardmarket page shows into the dollars the upload
// compares against.
//
// The upload holds an uploaded price against mtgban's own, and those are
// dollars. Cardmarket quotes euros, or pounds on its British shelves, so a
// price sent as written would be read as the currency it is not and the
// valuation would be wrong by an exchange rate.
//
// The feed is the one go-mtgban reads (mtgban/utils.go), quoting every
// currency against the dollar in one response, so a page mixing currencies
// costs one request either way.

globalThis.MKM = globalThis.MKM || {};

(function (MKM) {
  "use strict";

  var FEED =
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

  // The symbols Cardmarket prices in, as its pages write them.
  var CURRENCIES = { "€": "eur", "£": "gbp", $: "usd" };

  // currencyOf reads the currency a price is quoted in, or "" when the text
  // carries no symbol this knows.
  MKM.currencyOf = function (text) {
    for (var symbol in CURRENCIES) {
      if (String(text || "").indexOf(symbol) !== -1) {
        return CURRENCIES[symbol];
      }
    }
    return "";
  };

  // toRates reads the feed into the multipliers a caller wants: the feed
  // quotes what one dollar buys, and a price is going the other way.
  //
  // A currency quoted at zero is left out rather than kept as an infinity.
  // It converts nothing, and a caller reading a missing entry omits the
  // price where one reading an infinity would invent it.
  MKM.toRates = function (payload) {
    var quoted = (payload && payload.usd) || {};
    var rates = { usd: 1 };
    for (var currency in quoted) {
      var rate = quoted[currency];
      if (typeof rate === "number" && rate > 0) {
        rates[currency] = 1 / rate;
      }
    }
    return rates;
  };

  // fetchRates answers with the multipliers, or null when the feed cannot be
  // read. Null is a price column left empty, not a run refused: the cards
  // are still worth uploading when only their asking price is missing.
  MKM.fetchRates = function () {
    return fetch(FEED, { signal: MKM.deadline ? MKM.deadline() : undefined })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("rates: HTTP " + response.status);
        }
        return response.json();
      })
      .then(MKM.toRates)
      .catch(function () {
        return null;
      });
  };

  // priceUSD converts one price, and answers "" for anything it cannot
  // convert honestly - no rates, an unknown currency, an unreadable number.
  MKM.priceUSD = function (amount, currency, rates) {
    if (!rates || !currency || !amount) {
      return "";
    }
    var rate = rates[currency];
    if (!rate) {
      return "";
    }
    var value = Number(amount);
    if (!isFinite(value)) {
      return "";
    }
    return (value * rate).toFixed(2);
  };
})(globalThis.MKM);
