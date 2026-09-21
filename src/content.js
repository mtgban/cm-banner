// Puts an export control on a Cardmarket offers page.
//
// No extension API is used and no permission is asked for. The parse is a
// DOM read, the download is a blob and an anchor, and the rows reach the
// upload page through postMessage to the window this one opened - all plain
// web platform.
//
// They are not posted across origins. The upload needs the session, the
// site's cookie is same-site, and a request made from here would arrive
// without it. Handing the rows to a tab the person is already signed in to
// needs no cookie of ours, no CORS, and nothing stored anywhere.

(function (MKM) {
  "use strict";

  var PANEL_ID = "cm-banner";
  // What the two halves of the handoff say to each other.
  var READY = "cm-banner-ready";
  var ROWS = "cm-banner-rows";

  // Each game is served by its own deployment, so the rows go to the upload
  // that knows the cards.
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

  // collect reads the page and converts what it found, answering with the
  // CSV and what to say about it.
  function collect(panel) {
    var offers = MKM.parseOffers(document);
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
      var foreign = MKM.foreignCount(offers);
      if (foreign > 0) {
        // Worth saying: the CSV has no language column and the upload has
        // nothing to read one into, so these are valued as the English
        // printing, at a price asked for a different card.
        note += ", " + foreign + " non-English";
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

  function filename(game) {
    return "mkm-" + (game || "cardmarket") + "-" + today() + ".csv";
  }

  function exportOffers(panel) {
    withCollected(panel, function (done) {
      download(done.csv, filename(gameFromPath(location.pathname)));
      say(panel, done.note + " exported");
    });
  }

  // sendToBan hands the rows to the upload page directly, window to window.
  //
  // Nothing is stored and nothing is posted across origins. The upload page
  // is opened from the click that asked for it, so it keeps a handle on this
  // one; its own script says when it is listening, and the rows are passed to
  // that window and no other. A cross-origin POST would have to carry the
  // session, and the site's cookie is same-site, so it would arrive
  // unauthenticated.
  function sendToBan(panel) {
    var game = gameFromPath(location.pathname);
    var url = uploadURL(game);
    if (!url) {
      say(panel, "No BAN site for " + (game || "this page"));
      return;
    }
    var origin = new URL(url).origin;

    withCollected(panel, function (done) {
      var opened = window.open(url, "_blank");
      if (!opened) {
        say(panel, "The upload page was blocked; use the CSV");
        return;
      }

      function onMessage(event) {
        if (
          event.origin !== origin ||
          event.source !== opened ||
          !event.data ||
          event.data.type !== READY
        ) {
          return;
        }
        window.removeEventListener("message", onMessage);
        opened.postMessage(
          { type: ROWS, csv: done.csv, name: filename(game) },
          origin
        );
        say(panel, done.note + " sent to " + new URL(url).hostname);
      }

      // No deadline. The upload page answers when it has loaded, and how
      // long that takes is the network's business, not a number chosen here.
      window.addEventListener("message", onMessage);
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
      '<div class="cm-banner-note"></div>';

    panel.querySelector(".cm-banner-send").addEventListener("click", function () {
      sendToBan(panel);
    });
    panel.querySelector(".cm-banner-save").addEventListener("click", function () {
      exportOffers(panel);
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
