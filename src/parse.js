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

  // languageOf is Cardmarket's own id for the language a listing is in.
  //
  // The product link carries one, but only on a page that has already been
  // filtered by language - which is not the ordinary case, and the reason
  // this used to answer "" for every row on an unfiltered page and the
  // panel used to report no foreign printings on a seller with eight
  // hundred Italian ones.
  //
  // So where the link says nothing, the row's tooltips are offered to the
  // page's language filter, and the one it names is the language. The
  // filter is the authority on which word that is; nothing else in the row
  // distinguishes the language from the set or the rarity.
  function languageOf(row, href, titles, languages) {
    var linked = LANGUAGE_RE.exec(href);
    if (linked) {
      return linked[1];
    }
    if (!languages) {
      return "";
    }
    for (var i = 0; i < titles.length; i++) {
      if (languages[titles[i]]) {
        return languages[titles[i]];
      }
    }
    return "";
  }

  // parseRow reads one offer, or returns null for a row naming no product and
  // for one the catalog cannot be asked about.
  function parseRow(row, languages) {
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

    // The expansion as the page writes it, taken from the row's own link to
    // it rather than from whichever tooltip happens to come first. It is
    // kept beside the edition column and not instead of it: this is the
    // display name, which is what the filter list is keyed by, while the
    // column keeps the slug the matcher already reads.
    var expansion = row.querySelector('a[href*="/Expansions/"]');
    var expansionName = expansion
      ? (
          expansion.getAttribute("data-bs-original-title") ||
          expansion.getAttribute("aria-label") ||
          expansion.getAttribute("title") ||
          ""
        ).trim()
      : "";

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
      expansionName: expansionName,
      condition: condition,
      foil: titles.indexOf("Foil") !== -1 ? "foil" : "",
      quantity: quantity,
      articleID: article[1],
      // Kept as the page wrote them; the conversion needs a rate the parse
      // has no business fetching.
      // Cardmarket's own id for the language the listing is in, or "" where
      // the link names none. Reported rather than filtered on: the CSV has
      // no language column and the upload has nothing to read one into, so
      // the caller is told what it is taking rather than quietly given less.
      language: languageOf(row, href, titles, languages),
      price: priced ? normalizeAmount(priced[1]) : "",
      currency: priced ? MKM.currencyOf(priced[2]) : "",
    };
  }

  // parseOffers reads every offer on the page, once each. A row repeated
  // under the same article id is the same offer drawn twice.
  // languages is the page's own language filter, read from the live page
  // and passed in because a fetched page does not carry one.
  MKM.parseOffers = function (root, languages) {
    var rows = root.querySelectorAll('[id^="stockRow"]');
    var seen = Object.create(null);
    var offers = [];
    for (var i = 0; i < rows.length; i++) {
      var offer = parseRow(rows[i], languages);
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
  // ENGLISH is Cardmarket's own id for it, as its product links spell it.
  MKM.ENGLISH = "1";

  // foreignCount says how many of these the upload would read as English
  // without being told otherwise.
  MKM.foreignCount = function (offers) {
    var foreign = 0;
    for (var i = 0; i < offers.length; i++) {
      if (offers[i].language && offers[i].language !== MKM.ENGLISH) {
        foreign++;
      }
    }
    return foreign;
  };

  MKM.countRows = function (root) {
    return root.querySelectorAll('[id^="stockRow"]').length;
  };

  // Some options carry the seller's count for that expansion and some do
  // not ("The List (60)" beside "Fourth Edition"), so only a trailing one
  // is taken off - a set whose name ends in a bracketed number keeps it.
  var COUNT_RE = /\s*\(\d+\)\s*$/;

  // filterIDs reads one of the page's own filter dropdowns into the names
  // it is keyed by.
  //
  // Only the live page has these. The server sends the table and builds
  // the filters in script afterwards, so a page fetched during a walk has
  // no dropdown at all - which is why the maps are read once, from the
  // page being looked at, and handed to the parse.
  function filterIDs(root, name) {
    var ids = Object.create(null);
    var select = root.querySelector('select[name="' + name + '"]');
    if (!select) {
      return ids;
    }

    var options = select.querySelectorAll("option");
    for (var i = 0; i < options.length; i++) {
      var value = options[i].getAttribute("value");
      var label = (options[i].textContent || "").trim().replace(COUNT_RE, "");
      // First wins: a name is listed twice, once with the seller's count
      // and once without, and both carry the same id.
      if (value && label && !ids[label]) {
        ids[label] = value;
      }
    }
    return ids;
  }

  // expansionIDs reads the page's own expansion filter into the names it
  // is keyed by.
  //
  // A row carries no numeric expansion id - it links to /Expansions/<slug>
  // and names the set in a tooltip - but the filter beside the table lists
  // every one of the seller's expansions with the id the offers page
  // filters on. So the name the row shows is looked up in the list the
  // page would have used itself.
  //
  MKM.expansionIDs = function (root) {
    return filterIDs(root, "idExpansions[]");
  };

  // languageIDs reads the page's own language filter the same way, and is
  // what tells a language apart from every other word a row carries.
  //
  // A row names its language in a tooltip beside a flag, with nothing in
  // the markup to say that is what it is: the expansion, the rarity and
  // the condition are all tooltips too. Rather than guess which element
  // holds it, the filter decides - a tooltip is a language when the
  // language filter lists it, and the filter lists exactly the languages
  // the seller has.
  MKM.languageIDs = function (root) {
    return filterIDs(root, "idLanguages[]");
  };

  // TRACKING is the attribution MTGBAN puts on the card links it sends
  // out. It says where the visit came from and changes nothing about which
  // offer the link lands on, so it goes on the end, after the filters that
  // decide that.
  var TRACKING = [
    ["utm_source", "MTGBAN"],
    ["utm_medium", "text"],
    ["utm_campaign", "card_prices"],
  ];

  // offerURL is the way back: the seller's own list, narrowed by its own
  // filters to the one offer.
  //
  // Everything in it is read off the row and off the page's own filters,
  // so a link is the seller's list narrowed to the one offer. Verified
  // against the live site: asked for a plain name, for one carrying
  // accents, a comma and a version suffix ("Ad\u00e9wal\u00e9, Breaker of
  // Chains (V.1)"), and for a name and an expansion together, it answered
  // with exactly one row each time.
  //
  // base is the offers page's own path, so a link goes back to the list it
  // came from - the same seller, the same category, singles or sealed.
  //
  // Each part is added only when it is known. A filter that is left off
  // widens the list by one step; one that is guessed at hides the row the
  // link exists to reach.
  MKM.offerURL = function (base, offer, expansions) {
    if (!base || !offer || !offer.cardName) {
      return "";
    }

    var query = ["name=" + encodeURIComponent(offer.cardName)];

    var expansionID = expansions && offer.expansionName
      ? expansions[offer.expansionName]
      : "";
    if (expansionID) {
      query.push("idExpansions=" + expansionID);
    }
    // The language is in the product link on a page that has been filtered
    // by one and absent on a page that has not.
    if (offer.language) {
      query.push("idLanguages=" + offer.language);
    }

    query.push("isFoil=" + (offer.foil ? "Y" : "N"));
    // Never exported, so saying so narrows the list without any chance of
    // hiding the row being linked to.
    query.push("isSigned=N");
    query.push("isAltered=N");
    query.push("sortBy=name_asc");

    for (var i = 0; i < TRACKING.length; i++) {
      query.push(TRACKING[i][0] + "=" + TRACKING[i][1]);
    }

    return base + "?" + query.join("&");
  };

  MKM.slugToName = slugToName;
})(globalThis.MKM);
