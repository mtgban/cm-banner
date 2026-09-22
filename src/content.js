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
    var text = panel.querySelector(".cm-banner-text");
    if (text) {
      text.textContent = message;
    }
    if (note) {
      note.hidden = !message && !panel.classList.contains("cm-banner-busy");
    }
  }

  // busy turns the spinner on and takes the buttons away for as long as the
  // walk runs. A second click would start a second walk over the same
  // pages, and the export is slow enough to invite one.
  function busy(panel, working) {
    panel.classList.toggle("cm-banner-busy", working);
    var buttons = panel.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = working;
    }
  }

  // progress is what the panel says while the pages are being read. The
  // page number is counted here and the total is the one printed on the
  // page, so neither is taken from "Page 5 of 13" - that sentence is
  // written in whichever language the visitor reads.
  function progress(at) {
    var said = "Page " + at.pages + " \u00b7 " + at.offers;
    if (at.expected) {
      said += " of " + at.expected;
    }
    return said + " offers";
  }

  // hereOnly says whether the panel is set to take just the page on
  // screen. The whole list is the useful default - a file holding a
  // twentieth of a seller's stock looks exactly like a complete one - but
  // fifty pages is a minute of waiting, and somebody who wants the page in
  // front of them should not have to buy the other forty-nine to get it.
  function hereOnly(panel) {
    var box = panel.querySelector(".cm-banner-here");
    return !!(box && box.checked);
  }

  // thisPage answers in the shape a walk answers in, so that everything
  // downstream of it is the same code either way.
  function thisPage() {
    var offers = MKM.parseOffers(document);
    return {
      offers: offers,
      pages: 1,
      rows: MKM.countRows(document),
      // What was on offer here, not what the seller has: nothing was
      // promised beyond this page, so nothing can be short.
      expected: offers.length,
      // Nothing was promised beyond this page, so nothing is being
      // withheld either.
      capped: false,
      stopped: "",
    };
  }

  // collect reads what the panel is set to take and converts it,
  // answering with the CSV and what to say about it.
  //
  // By default the whole list, not the page on screen: Cardmarket
  // paginates at twenty and the export follows the pager to the end. That
  // is a fetch per page, so it is slow enough to be worth narrating.
  function collect(panel) {
    if (MKM.countRows(document) === 0) {
      return Promise.resolve({ csv: "", note: "No offers on this page" });
    }

    busy(panel, true);

    var reading;
    if (hereOnly(panel)) {
      reading = Promise.resolve(thisPage());
    } else {
      say(panel, "Reading page 1\u2026");
      reading = MKM.walkPages(document, location.href, {
        onProgress: function (at) {
          say(panel, progress(at));
        },
      });
    }

    return reading
      .then(function (walked) {
        if (walked.offers.length === 0) {
          // Told apart deliberately: a list whose rows all refused is not
          // an empty list, and only one of the two is worth reporting.
          return {
            csv: "",
            note: "None of the " + walked.rows + " offers here could be read",
          };
        }
        say(panel, "Reading rates\u2026");
        return MKM.fetchRates().then(function (rates) {
          return priced(walked, rates);
        });
      })
      .then(
        function (done) {
          busy(panel, false);
          return done;
        },
        function (err) {
          busy(panel, false);
          throw err;
        }
      );
  }

  // priced puts a dollar price on every row and says what was taken.
  function priced(walked, rates) {
    var offers = walked.offers;
    var unpriced = 0;
    offers.forEach(function (offer) {
      offer.priceUSD = MKM.priceUSD(offer.price, offer.currency, rates);
      if (!offer.priceUSD) {
        unpriced++;
      }
    });

    var note = offers.length + " rows";
    if (walked.pages > 1) {
      note += " from " + walked.pages + " pages";
    }
    var skipped = walked.rows - offers.length;
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
    if (walked.capped) {
      // Cardmarket pages a seller to 100 and stops, and page 100 ends like
      // any other last page. Unsaid, the file is indistinguishable from a
      // small seller's complete one.
      note +=
        " \u2014 Cardmarket's limit, not the whole shelf; filter to reach the rest";
    } else if (walked.expected && walked.rows < walked.expected) {
      // The first page promised more than turned up. Nothing here can get
      // the difference back - a sale mid-walk shifts every later offer up
      // a place and one falls between two fetches - but it can be said.
      note += " \u2014 " + walked.expected + " were listed when it started";
    }
    if (walked.stopped) {
      // A walk that gave up part way says so, rather than handing over a
      // short list that reads like the whole inventory.
      note += " \u2014 stopped early: " + walked.stopped;
    }
    return {
      csv: MKM.toCSV(offers),
      note: note,
      count: offers.length,
      partial: !!walked.stopped,
    };
  }

  function withCollected(panel, andThen) {
    collect(panel).then(
      function (done) {
        if (!done.csv) {
          say(panel, done.note);
          return;
        }
        andThen(done);
      },
      function (err) {
        // Nothing above rejects on purpose - a refused page stops the walk
        // and a refused rate leaves the column empty. So this is a bug,
        // and a panel that says which one beats a panel that went quiet.
        say(panel, "Export failed: " + (err && err.message ? err.message : err));
      }
    );
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
        // Nothing is said of a whole list: the tab that just opened is
        // the answer and says more than this could. A short one keeps its
        // warning on screen, because the tab receiving it cannot tell
        // that it is short and neither could anyone reading it there.
        say(panel, done.partial ? done.note : "");
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
      // What the export will actually take: the seller's whole list under
      // the filter in force, or just the rows on screen when asked for
      // that. Naming the wrong one of those is how a twentieth of a
      // collection gets uploaded as all of it.
      // Printed the way Cardmarket printed it, because it is not always a
      // number: a seller past Cardmarket's paging limit reads "2000+", and
      // rounding that to 2000 would promise an exact figure that is not
      // one.
      var taking = hereOnly(panel)
        ? String(count)
        : MKM.totalSaid(document) || String(count);
      text.textContent = "Export " + taking + " offers";
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
      '<label class="cm-banner-scope">' +
      '<input type="checkbox" class="cm-banner-here">' +
      "<span>This page only</span>" +
      "</label>" +
      '<div class="cm-banner-actions">' +
      '<button type="button" class="cm-banner-send">Send to BAN</button>' +
      '<button type="button" class="cm-banner-save">CSV</button>' +
      "</div>" +
      '<div class="cm-banner-note" hidden>' +
      '<span class="cm-banner-spin" aria-hidden="true"></span>' +
      '<span class="cm-banner-text"></span>' +
      "</div>";

    // Changing what will be taken changes what the button promises, and
    // makes whatever the last export said about a different scope stale.
    panel.querySelector(".cm-banner-here").addEventListener("change", function () {
      say(panel, "");
      label(panel);
    });
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
        // Not while the walk is running. The pages being read are parsed
        // documents of their own and never touch this one, but Cardmarket
        // keeps working on its own table, and reacting to that would wipe
        // the line saying how far along the export is.
        if (panel.classList.contains("cm-banner-busy")) {
          return;
        }
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
