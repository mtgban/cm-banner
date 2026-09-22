// Puts an export control on a Cardmarket offers page.
//
// No extension API is used and no permission is asked for. The parse is a
// DOM read, the download is a blob and an anchor, and the rows reach the
// site through postMessage to the window this one opened - all plain web
// platform.
//
// They are not posted across origins. The upload needs the session, the
// site's cookie is same-site, and a request made from here would arrive
// without it. The site has a page for being handed a list instead:
// /upload/handoff opens as an ordinary navigation, so it carries the
// session, and it does its own uploading. Nothing here reaches into a form
// that belongs to somebody else.

(function (MKM) {
  "use strict";

  var PANEL_ID = "cm-banner";
  // What the two halves of the handoff say to each other.
  // The protocol the site's handoff page speaks.
  var READY = "mtgban-handoff-ready";
  var ROWS = "mtgban-handoff-rows";

  // Each game is served by its own deployment. Magic is the default one and
  // answers at the bare domain: magic.mtgban.com redirects there, which
  // changes the origin on the way, so it is named as it ends up.
  var HOSTS = {
    magic: "mtgban.com",
    pokemon: "pokemon.mtgban.com",
    yugioh: "yugioh.mtgban.com",
    lorcana: "lorcana.mtgban.com",
    onepiece: "onepiece.mtgban.com",
    fleshandblood: "fleshandblood.mtgban.com",
    riftbound: "riftbound.mtgban.com",
  };

  // isBanHost says whether an origin is one of ours. The window that answers
  // is not always the one that was opened - a deployment may redirect, and
  // that lands on a different origin - so the origin is checked for being
  // ours rather than for being the exact one asked for. What pins the
  // conversation to the right window is the source check beside it.
  function isBanHost(origin) {
    var parsed;
    try {
      parsed = new URL(origin);
    } catch (err) {
      return false;
    }
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "mtgban.com" ||
        parsed.hostname.slice(-11) === ".mtgban.com")
    );
  }

  // The page path names the game: /<language>/<Game>/Users/...
  function gameFromPath(pathname) {
    var parts = pathname.split("/");
    return parts.length > 2 && parts[2] ? parts[2].toLowerCase() : "";
  }

  function uploadURL(game) {
    var host = HOSTS[game];
    return host ? "https://" + host + "/upload/handoff" : "";
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
      return { csv: MKM.toCSV(offers), note: note, count: offers.length };
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

  // sendToBan hands the rows to the site's handoff page, window to window.
  //
  // That page is the site's own and does its own uploading, so nothing here
  // has to know the shape of a form that is not ours. It is opened from the
  // click that asked for it, so it keeps a handle on this window; it says
  // when it is listening, and the rows go to that window and no other.
  function sendToBan(panel) {
    var url = uploadURL(gameFromPath(location.pathname));
    withCollected(panel, function (done) {
      var opened = window.open(url, "_blank");
      if (!opened) {
        say(panel, "The upload page was blocked; use the CSV");
        return;
      }

      function onMessage(event) {
        if (
          event.source !== opened ||
          !isBanHost(event.origin) ||
          !event.data ||
          event.data.type !== READY
        ) {
          return;
        }
        window.removeEventListener("message", onMessage);
        // Answered to the origin that spoke, which is where the page
        // actually ended up rather than where it was sent.
        // The count goes with them: the page receives text, and text does
        // not say whether its first line is a header or a card.
        opened.postMessage(
          { type: ROWS, csv: done.csv, rows: done.count },
          event.origin
        );
        // Nothing is said. The tab that just opened is the answer, and it
        // says more than this could.
        say(panel, "");
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
      '<div class="cm-banner-note"></div>' +
      '<button type="button" class="cm-banner-send">Send to BAN</button>' +
      '<button type="button" class="cm-banner-save">Download CSV</button>' +
      '<div class="cm-banner-brand">' +
      '<span class="cm-banner-mark" aria-hidden="true"></span>' +
      '<span class="cm-banner-label"></span>' +
      "</div>";

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
    // A game this cannot send anywhere gets no panel at all. The matches in
    // the manifest name the seven Cardmarket sells that BAN prices, but a
    // path is not a promise: anything that reaches here naming a game with
    // no deployment behind it is a page to stay off.
    if (!uploadURL(gameFromPath(location.pathname))) {
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
