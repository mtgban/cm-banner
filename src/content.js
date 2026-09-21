// Puts an export control on a Cardmarket offers page.
//
// The parse is a DOM read and the download is a blob and an anchor, both
// plain web platform. The one extension API used is storage, and only to
// hand a finished CSV to the upload page in the other tab: a direct POST
// cannot work, because the site sends no CORS headers and its session cookie
// is same-site, so a cross-origin request from here arrives unauthenticated.
// Filling the form on a tab the person is already signed in to asks for
// nothing and sends nothing anywhere.

(function (MKM) {
  "use strict";

  var PANEL_ID = "cm-banner";
  // Cardmarket's own id for English, as its product links spell it.
  var ENGLISH = "1";
  // Where the finished CSV waits for the upload page to pick it up.
  var HANDOFF = "cm-banner-handoff";

  // Firefox and Safari expose browser; Chrome exposes chrome.
  var api = globalThis.browser || globalThis.chrome;

  // Each game is served by its own deployment, so the upload that knows a
  // card is the one on that game's own host.
  var HOSTS = {
    magic: "magic",
    pokemon: "pokemon",
    yugioh: "yugioh",
    lorcana: "lorcana",
    onepiece: "onepiece",
    fleshandblood: "fleshandblood",
    riftbound: "riftbound",
  };

  // The page path names the game: /<language>/<Game>/Users/...
  function gameFromPath(pathname) {
    var parts = pathname.split("/");
    return parts.length > 2 && parts[2] ? parts[2].toLowerCase() : "";
  }

  function uploadURL(game) {
    var host = HOSTS[game];
    return host ? "https://" + host + ".mtgban.com/upload" : "";
  }

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function download(text, filename) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Firefox needs the object to outlive the click it was created for.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  function say(panel, message) {
    var note = panel.querySelector(".cm-banner-note");
    if (note) {
      note.textContent = message;
    }
  }

  // languageWanted is the filter the parser is handed: English alone, or
  // every language the page lists.
  //
  // It defaults to English because the CSV has no language column and the
  // upload matches what it is given as English: a German printing exported
  // unmarked is priced as the English one. Turning it off is the deliberate
  // act, and the panel says how many rows it cost.
  function languageWanted(panel) {
    var box = panel.querySelector(".cm-banner-english");
    return box && box.checked ? ENGLISH : "";
  }

  // collect reads the page and converts what it found, answering with the
  // CSV and what to say about it.
  function collect(panel) {
    var offers = MKM.parseOffers(document, languageWanted(panel));
    var total = MKM.countRows(document);

    if (offers.length === 0) {
      // Told apart deliberately: a page with rows that all refused is not a
      // page with no rows, and only one of the two is worth reporting.
      return {
        csv: "",
        note:
          total === 0
            ? "No offers on this page"
            : "None of the " + total + " offers here could be read",
      };
    }

    return MKM.fetchRates().then(function (rates) {
      var unpriced = 0;
      offers.forEach(function (offer) {
        offer.priceUSD = MKM.priceUSD(offer.price, offer.currency, rates);
        if (!offer.priceUSD) {
          unpriced++;
        }
      });

      var note = offers.length + " rows";
      var skipped = total - offers.length;
      if (skipped > 0) {
        note += ", " + skipped + " skipped";
      }
      if (unpriced > 0) {
        // Said out loud: a blank price is a row the upload values off its
        // own prices rather than the seller's, which is a different answer.
        note += ", " + unpriced + " unpriced";
      }
      return { csv: MKM.toCSV(offers), note: note };
    });
  }

  function withCollected(panel, andThen) {
    var result = collect(panel);
    if (!result.then) {
      say(panel, result.note);
      return;
    }
    say(panel, "Reading rates…");
    result.then(function (done) {
      if (!done.csv) {
        say(panel, done.note);
        return;
      }
      andThen(done);
    });
  }

  function exportOffers(panel) {
    withCollected(panel, function (done) {
      download(
        done.csv,
        "mkm-" + (gameFromPath(location.pathname) || "cardmarket") + "-" + today() + ".csv"
      );
      say(panel, done.note + " exported");
    });
  }

  // sendToBan leaves the CSV where the upload page's own script will find it
  // and opens that page. The window is opened from the click that asked for
  // it, so no popup is blocked and no tabs permission is needed.
  function sendToBan(panel) {
    var game = gameFromPath(location.pathname);
    var url = uploadURL(game);
    if (!url) {
      say(panel, "No BAN site for " + (game || "this page"));
      return;
    }
    if (!api || !api.storage || !api.storage.local) {
      say(panel, "Storage unavailable; use the CSV");
      return;
    }

    withCollected(panel, function (done) {
      var payload = {};
      payload[HANDOFF] = { csv: done.csv, at: Date.now(), game: game };
      api.storage.local.set(payload, function () {
        window.open(url, "_blank", "noopener");
        say(panel, done.note + " sent to " + game + ".mtgban.com");
      });
    });
  }

  // shown is the row count the panel last named, so a change in the page can
  // be told from the page merely being touched.
  var shown = -1;

  function label(panel) {
    var count = MKM.countRows(document);
    var text = panel.querySelector(".cm-banner-label");
    if (text) {
      text.textContent = "Export " + count + " offers";
    }
    panel.hidden = count === 0;
    shown = count;
    return count;
  }

  function build() {
    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<div class="cm-banner-label"></div>' +
      '<div class="cm-banner-actions">' +
      '<button type="button" class="cm-banner-send">Send to BAN</button>' +
      '<button type="button" class="cm-banner-save">CSV</button>' +
      "</div>" +
      '<label class="cm-banner-lang">' +
      '<input type="checkbox" class="cm-banner-english" checked>' +
      "<span>English only</span>" +
      "</label>" +
      '<div class="cm-banner-note"></div>';

    panel.querySelector(".cm-banner-send").addEventListener("click", function () {
      sendToBan(panel);
    });
    panel.querySelector(".cm-banner-save").addEventListener("click", function () {
      exportOffers(panel);
    });
    // Changing the filter does not re-export, and what the last export said
    // was said about the other filter.
    panel
      .querySelector(".cm-banner-english")
      .addEventListener("change", function () {
        say(panel, "");
      });
    return panel;
  }

  function install() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    var panel = build();
    document.body.appendChild(panel);
    label(panel);

    // The page fills its table after load and refills it on every filter, so
    // the count follows the table rather than the moment this ran.
    //
    // Only a changed count counts as a change. Exporting appends an anchor to
    // the document and takes it away again, which is a mutation like any
    // other: reacting to every one of those cleared the line saying what the
    // export had just done, about a third of a second after it said it.
    var pending = null;
    var observer = new MutationObserver(function () {
      if (pending !== null) {
        return;
      }
      pending = setTimeout(function () {
        pending = null;
        if (MKM.countRows(document) === shown) {
          return;
        }
        // The table itself moved, so what the last export said of it no
        // longer holds.
        say(panel, "");
        label(panel);
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})(globalThis.MKM);
