// Reads the offers a Cardmarket page lists into plain rows.
//
// The page is segmented by the DOM and each row's fields are read with the
// patterns cmd/mkmhtml2csv already proves against saved pages: the segmenting
// is what a regex over flattened text does worst and querySelectorAll does
// best, and the field patterns are the ones known to hold. Attributes are read
// off outerHTML rather than off an img's src because the page lazy-loads its
// images, and until one is shown its product id sits in a data- attribute
// whose name is the page's business, not ours.

globalThis.MKM = globalThis.MKM || {};

(function (MKM) {
  "use strict";

  // Cardmarket grades in words, folded the way go-mtgban's own Cardmarket
  // scraper folds them (cardmarket/market.go, mkmCondition): seven grades
  // onto five, MT/NM > NM, EX > SP, GD > MP, LP/PL > HP, PO > PO. Both
  // played grades land on HP - writing "Light Played" as MP would hand the
  // upload a better condition than the seller listed, and it is trusted.
  var CONDITIONS = {
    Mint: "NM",
    "Near Mint": "NM",
    Excellent: "SP",
    Good: "MP",
    "Light Played": "HP",
    Played: "HP",
    Poor: "PO",
  };

  // A card the seller has altered, signed or inked is not the printing the
  // catalog knows, and no id of ours names it.
  var SKIPPED = ["Altered", "Signed", "Inked"];

  var ARTICLE_RE = /stockRow(\d+)/;
  // Cardmarket files an offer under the category it sells it in, and the
  // category decides how much path follows: a single is filed under its set
  // ("/Products/Singles/Urzas-Legacy/Thornwind-Faeries"), while a sealed
  // product is filed directly under its category and carries its set in its
  // own name ("/Products/Boosters/Adventures-in-the-Forgotten-Realms-Set-
  // Booster"). So the tail is taken whole and split afterwards, rather than
  // a fixed number of segments being demanded of every category.
  var PRODUCT_RE = /\/Products\/([^/?"<& ]+)\/([^?"<& ]+)/;
  var LANGUAGE_RE = /[?&]language=(\d+)/;
  var QTY_RE = /^\s*(\d+)/;
  // Cardmarket writes a decimal comma, and the symbol says which currency
  // the shelf quotes in. The price has to be the whole of what its element
  // says: read off the row's flattened text instead, a quantity sitting
  // beside the price is glued to the front of it, and "1" before "0,05 EUR"
  // reads as ten euros and five cents.
  var PRICE_RE = /^(\d[\d.,]*)\s*(\u20ac|\u00a3|\$)$/;
  // The product id is the image's own file name:
  // ".../1/ULG/10601/10601.jpg" is product 10601. Reading the last path
  // element rather than a fixed position in the path keeps it working
  // whatever the host puts in front of it.
  var IMG_RE = /\/(\d+)\.(?:jpg|jpeg|png|webp|gif)/i;
  // An older layout named the file after the card and the id a directory.
  var IMG_LEGACY_RE = /\/items\/\d+\/(\d+)\//;

  // titlesOf collects every tooltip the row carries. Cardmarket writes the
  // same fact into title or data-bs-original-title depending on whether the
  // tooltip has been initialised yet, so both are read.
  function titlesOf(row) {
    var found = [];
    var nodes = row.querySelectorAll("[title], [data-bs-original-title]");
    for (var i = 0; i < nodes.length; i++) {
      var title = nodes[i].getAttribute("title");
      var original = nodes[i].getAttribute("data-bs-original-title");
      if (title) {
        found.push(title.trim());
      }
      if (original) {
        found.push(original.trim());
      }
    }
    return found;
  }

  function firstMatch(html, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var found = patterns[i].exec(html);
      if (found) {
        return found[1];
      }
    }
    return "";
  }

  // ownText is what an element says itself, without what its children say.
  function ownText(element) {
    var text = "";
    var children = element.childNodes;
    for (var i = 0; i < children.length; i++) {
      if (children[i].nodeType === 3) {
        text += children[i].textContent;
      }
    }
    return text.trim();
  }

  // priceOf finds the element whose whole text is a price. The row shows the
  // unit price before any line total, so the first one found is the asking
  // price.
  function priceOf(row) {
    var elements = row.querySelectorAll("*");
    for (var i = 0; i < elements.length; i++) {
      var found = PRICE_RE.exec(ownText(elements[i]));
      if (found) {
        return found;
      }
    }
    return null;
  }

  // normalizeAmount reads the number Cardmarket writes: a decimal comma,
  // and a full stop grouping the thousands above it.
  function normalizeAmount(written) {
    return written.replace(/\./g, "").replace(",", ".");
  }

  // slugToName turns a product slug back into the card's name. It is the
  // fallback, not the first answer: a slug is lossy, and the link's own text
  // is the name Cardmarket displays. "Adewale Breaker of Chains" is the slug
  // for "Adéwalé, Breaker of Chains", and "Aether Tide" is slugged "-ther-
  // Tide" - the ligature dropped outright, leaving a dash the name never had.
  //
  // The version suffix goes, "-s-" is the apostrophe it stands for, and the
  // rest of the dashes were spaces.
  function slugToName(slug) {
    return slug
      .replace(/-V\d+$/, "")
      .replace(/-s-/g, "'s-")
      .replace(/-/g, " ");
  }

  // parseRow reads one offer, or returns null for a row naming no product and
  // for one the catalog cannot be asked about.
  function parseRow(row, languageFilter) {
    var article = ARTICLE_RE.exec(row.id || "");
    if (!article) {
      return null;
    }

    var link = row.querySelector('a[href*="/Products/"]');
    if (!link) {
      return null;
    }
    var href = link.getAttribute("href") || "";
    var product = PRODUCT_RE.exec(href);
    if (!product) {
      return null;
    }

    // Two segments name a set and a card; one names a product whose set is
    // part of what it is called.
    var tail = product[2].split("/");
    var nameSlug = tail.length > 1 ? tail[1] : tail[0];
    var editionSlug = tail.length > 1 ? tail[0] : "";

    if (languageFilter) {
      var language = LANGUAGE_RE.exec(href);
      if (language && language[1] !== languageFilter) {
        return null;
      }
    }

    var titles = titlesOf(row);
    for (var i = 0; i < SKIPPED.length; i++) {
      if (titles.indexOf(SKIPPED[i]) !== -1) {
        return null;
      }
    }

    var condition = "";
    for (var j = 0; j < titles.length; j++) {
      if (Object.prototype.hasOwnProperty.call(CONDITIONS, titles[j])) {
        condition = CONDITIONS[titles[j]];
        break;
      }
    }

    // The link says the card's name in full, punctuation and all; the slug
    // it points at is what survived being made URL-safe.
    var linked = (link.textContent || "").replace(/\s+/g, " ").trim();

    var priced = priceOf(row);
    var count = row.querySelector(".item-count");
    var quantity = "1";
    if (count) {
      var counted = QTY_RE.exec(count.textContent || "");
      if (counted) {
        quantity = counted[1];
      }
    }

    return {
      mcmID: firstMatch(row.outerHTML, [IMG_RE, IMG_LEGACY_RE]),
      cardName: linked || slugToName(nameSlug),
      edition: editionSlug.replace(/-/g, " "),
      condition: condition,
      foil: titles.indexOf("Foil") !== -1 ? "foil" : "",
      quantity: quantity,
      articleID: article[1],
      // Kept as the page wrote them; the conversion needs a rate the parse
      // has no business fetching.
      price: priced ? normalizeAmount(priced[1]) : "",
      currency: priced ? MKM.currencyOf(priced[2]) : "",
    };
  }

  // parseOffers reads every offer on the page, once each. A row repeated
  // under the same article id is the same offer drawn twice.
  MKM.parseOffers = function (root, languageFilter) {
    var rows = root.querySelectorAll('[id^="stockRow"]');
    var seen = Object.create(null);
    var offers = [];
    for (var i = 0; i < rows.length; i++) {
      var offer = parseRow(rows[i], languageFilter);
      if (!offer || seen[offer.articleID]) {
        continue;
      }
      seen[offer.articleID] = true;
      offers.push(offer);
    }
    return offers;
  };

  // countRows says how many offers the page holds at all, so the caller can
  // tell "no offers here" from "every offer was skipped".
  MKM.countRows = function (root) {
    return root.querySelectorAll('[id^="stockRow"]').length;
  };

  MKM.slugToName = slugToName;
})(globalThis.MKM);
