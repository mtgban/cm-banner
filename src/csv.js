// Writes the offers out in the shape the site's upload reads.
//
// Every column here is one the upload's header matcher already names, and the
// names are chosen so it names them the way it should: "card_name" reaches
// cardName rather than edition, "foil" reaches the printing column, and
// "mcm_id" reaches the Cardmarket id. "article_id" and "mkm_url" reach
// nothing and are meant to - the first is carried so a row can be traced back
// to the offer it came from, the second is the way back to it, and the
// matcher ignores both.
//
// price_usd is the asking price converted. The upload holds a price it is
// given against BAN's own, and those are dollars, while Cardmarket quotes
// euros or pounds: the column has to name the currency it is read as, or a
// valuation comes out wrong by an exchange rate. A row whose price could not
// be converted honestly carries an empty one rather than a guess.

globalThis.MKM = globalThis.MKM || {};

(function (MKM) {
  "use strict";

  var COLUMNS = [
    ["mcm_id", "mcmID"],
    ["card_name", "cardName"],
    ["edition", "edition"],
    ["condition", "condition"],
    ["foil", "foil"],
    ["quantity", "quantity"],
    ["price_usd", "priceUSD"],
    ["article_id", "articleID"],
    ["mkm_url", "url"],
  ];

  // field quotes what has to be quoted and nothing else.
  function field(value) {
    var text = value === undefined || value === null ? "" : String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function row(values) {
    var quoted = [];
    for (var i = 0; i < values.length; i++) {
      quoted.push(field(values[i]));
    }
    return quoted.join(",");
  }

  MKM.toCSV = function (offers) {
    var header = [];
    for (var i = 0; i < COLUMNS.length; i++) {
      header.push(COLUMNS[i][0]);
    }

    var lines = [row(header)];
    for (var j = 0; j < offers.length; j++) {
      var values = [];
      for (var k = 0; k < COLUMNS.length; k++) {
        values.push(offers[j][COLUMNS[k][1]]);
      }
      lines.push(row(values));
    }
    // A trailing newline: the last row ends like every other one.
    return lines.join("\r\n") + "\r\n";
  };

  MKM.csvColumns = function () {
    var names = [];
    for (var i = 0; i < COLUMNS.length; i++) {
      names.push(COLUMNS[i][0]);
    }
    return names;
  };
})(globalThis.MKM);
