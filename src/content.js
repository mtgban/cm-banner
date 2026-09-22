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
  var SEND = "Send to BAN";
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

  // say writes the one line the panel has to say things on. The line is
  // always there, empty or not: the panel is anchored to the corner and
  // grows upwards, so a line that came and went would move the buttons
  // out from under the cursor every time it did.
  function say(panel, message) {
    var text = panel.querySelector(".cm-banner-text");
    if (text) {
      text.textContent = message;
    }
  }

  // hold asks the browser to confirm before the page goes anywhere.
  //
  // A read lives in this page. Following a link, going back, or reloading
  // takes the content script with it, and a hundred pages of reading goes
  // too - silently, since by then there is nothing left to say so. The
  // prompt covers all three, which is the point of using this rather than
  // watching for clicks on links.
  //
  // The wording is the browser's own. Chrome, Firefox and Safari all
  // stopped showing a page's message years ago; preventDefault is what
  // asks for the prompt at all, and the other two lines are how older
  // browsers spell the same request.
  function hold(event) {
    event.preventDefault();
    event.returnValue = "";
    return "";
  }

  // busy turns the spinner on and takes the buttons away for as long as the
  // walk runs. A second click would start a second walk over the same
  // pages, and the export is slow enough to invite one.
  //
  // It is also where the page is held, because "a read is running" and
  // "leaving would throw it away" are the same condition. The listener
  // comes off the moment it is not: a page carrying one of these is a
  // page the browser will not keep in its back/forward cache, and that
  // would be this extension slowing down every Cardmarket page it sat on.
  function busy(panel, working) {
    panel.classList.toggle("cm-banner-busy", working);
    var buttons = panel.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = working;
    }
    if (working) {
      window.addEventListener("beforeunload", hold);
    } else {
      window.removeEventListener("beforeunload", hold);
    }
  }

  // progress is how far along the read is and nothing else. The total is
  // the one printed on the page, never taken from "Page 5 of 13" beside
  // it - that sentence is written in whichever language the visitor reads.
  function progress(at) {
    if (at.expected) {
      return at.offers + " / " + at.expected;
    }
    return at.offers + " offers";
  }

  // SCOPES is what the button will take, in the order clicking moves
  // through them, and the word it uses for it.
  //
  // The whole list is the useful default - a file holding a twentieth of a
  // seller's stock looks exactly like a complete one - but fifty pages is
  // a minute of waiting, and somebody who wants the page in front of them
  // should not have to buy the other forty-nine to get it.
  //
  // The label is the control. A checkbox beside it said the same thing
  // twice, in two places that could disagree.
  var SCOPES = [
    { here: false, says: "all offers" },
    { here: true, says: "this page only" },
  ];

  var scope = 0;

  function hereOnly() {
    return SCOPES[scope].here;
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
  function collect(panel, stale) {
    if (MKM.countRows(document) === 0) {
      return Promise.resolve({ csv: "", note: "No offers on this page" });
    }

    busy(panel, true);
    // Nothing is said to begin with. The spinner is already saying it,
    // and the first page answers before a sentence would have been read.
    say(panel, "");

    var reading;
    if (hereOnly()) {
      reading = Promise.resolve(thisPage());
    } else {
      reading = MKM.walkPages(document, location.href, {
        cancelled: stale,
        onProgress: function (at) {
          if (stale()) {
            return;
          }
          say(panel, progress(at));
        },
      });
    }

    return reading
      .then(function (walked) {
        if (stale()) {
          // Abandoned while it ran. Nothing is said, and no rate is
          // fetched for rows that are about to be dropped.
          return { csv: "", note: "" };
        }
        if (walked.offers.length === 0) {
          // Told apart deliberately: a list whose rows all refused is not
          // an empty list, and only one of the two is worth reporting.
          return {
            csv: "",
            note: "None of the " + walked.rows + " offers here could be read",
          };
        }
        return MKM.fetchRates().then(function (rates) {
          return priced(walked, rates);
        });
      });
  }

  // priced puts a dollar price on every row and says what is worth
  // saying about them, which is usually nothing at all.
  //
  // The button already says how many rows there are, so the line below it
  // carries only what the count does not: what was dropped, what will be
  // valued as something it is not, and what is missing from the list
  // altogether.
  function priced(walked, rates) {
    var offers = walked.offers;
    var unpriced = 0;
    offers.forEach(function (offer) {
      offer.priceUSD = MKM.priceUSD(offer.price, offer.currency, rates);
      if (!offer.priceUSD) {
        unpriced++;
      }
    });

    var said = [];
    var skipped = walked.rows - offers.length;
    if (skipped > 0) {
      said.push(skipped + " skipped");
    }
    var foreign = MKM.foreignCount(offers);
    if (foreign > 0) {
      // Worth saying: the CSV has no language column and the upload has
      // nothing to read one into, so these are valued as the English
      // printing, at a price asked for a different card.
      said.push(foreign + " non-English");
    }
    if (unpriced > 0) {
      // Said out loud: a blank price is a row the upload values off its
      // own prices rather than the seller's, which is a different answer.
      said.push(unpriced + " unpriced");
    }
    if (walked.capped) {
      // Cardmarket pages a seller to 100 and stops, and page 100 ends
      // like any other last page. Unsaid, the file is indistinguishable
      // from a small seller's complete one.
      said.push("capped at 100 pages");
    } else if (walked.expected && walked.rows < walked.expected) {
      // The first page promised more than turned up. A sale mid-walk
      // shifts every later offer up a place and one falls between two
      // fetches.
      said.push(walked.expected + " were listed");
    }
    if (walked.stopped) {
      said.push(walked.stopped);
    }

    return {
      csv: MKM.toCSV(offers),
      note: said.join(", "),
      count: offers.length,
      // Short for any reason, so it goes on saying so after being handed
      // over: the tab that receives the rows cannot tell that they are
      // not all of them, and neither could anyone reading them there.
      partial: !!(walked.stopped || walked.capped),
    };
  }

  // generation counts the reads, and bumping it is how one is abandoned.
  //
  // A fetch in flight cannot be recalled, so the read is not stopped so
  // much as disowned: the walk asks between pages whether anyone still
  // wants it, and everything that comes back late finds it is no longer
  // the current read and says nothing. That is also what keeps a stopped
  // read from turning the spinner off underneath the one after it.
  var generation = 0;

  // read answers with the rows, or with null having already said why there
  // are none - or silently, if it was abandoned while it ran. It returns
  // its promise synchronously, which is what lets a caller open a window
  // in the same breath as asking for it.
  function read(panel) {
    var mine = ++generation;
    function stale() {
      return mine !== generation;
    }

    return collect(panel, stale).then(
      function (done) {
        if (stale()) {
          return null;
        }
        busy(panel, false);
        if (!done.csv) {
          say(panel, done.note);
          return null;
        }
        return done;
      },
      function (err) {
        if (stale()) {
          return null;
        }
        busy(panel, false);
        // Nothing above rejects on purpose - a refused page stops the walk
        // and a refused rate leaves the column empty. So this is a bug,
        // and a panel that says which one beats a panel that went quiet.
        say(panel, "Export failed: " + (err && err.message ? err.message : err));
        return null;
      }
    );
  }

  function filename(game) {
    return "mkm-" + (game || "cardmarket") + "-" + today() + ".csv";
  }

  function exportOffers(panel) {
    function write(done) {
      download(done.csv, filename(gameFromPath(location.pathname)));
      say(panel, done.note ? "saved, " + done.note : "saved");
    }

    if (armed) {
      // Already read. Walking a hundred pages again to write out rows
      // that are sitting here would be a minute spent on nothing.
      write(armed);
      return;
    }
    read(panel).then(function (done) {
      if (!done) {
        return;
      }
      arm(panel, done);
      write(done);
    });
  }

  // handOff opens the site's handoff page and gives it the rows.
  //
  // The window is opened from the click with nothing asynchronous in
  // front of it, because window.open needs that click - Firefox keeps one
  // alive for about five seconds and then calls the result a pop-up.
  //
  // The rows may already be in hand or may be a moment away, so they come
  // in as a promise and whichever of "the page is listening" and "the
  // rows are ready" lands second does the handing over. The page it opens
  // says "Waiting for the card list..." until then, and waits for as long
  // as it takes.
  //
  // That page is the site's own and does its own uploading, so nothing
  // here has to know the shape of a form that is not ours. It says it is
  // listening once, as it loads, which cannot happen before this function
  // has returned - so the listener is always in place in time.
  function handOff(panel, rows) {
    var opened = window.open(uploadURL(gameFromPath(location.pathname)), "_blank");
    if (!opened) {
      // Rows in hand stay in hand, so this is worth another click rather
      // than another read.
      say(panel, "The upload page was blocked; use the CSV");
      return;
    }

    var listening = "";
    var collected = null;

    function give() {
      if (!listening || !collected) {
        return;
      }
      if (opened.closed) {
        say(panel, "The upload page was closed; use the CSV");
        return;
      }
      // Answered to the origin that spoke, which is where the page
      // actually ended up rather than where it was sent.
      // The count goes with them: the page receives text, and text does
      // not say whether its first line is a header or a card.
      opened.postMessage(
        { type: ROWS, csv: collected.csv, rows: collected.count },
        listening
      );
      // Spent only once they have landed somewhere, so a tab that never
      // answered can be tried again without reading the pages afresh.
      disarm(panel);
      // Nothing is said of a whole list: the tab that just took it is the
      // answer and says more than this could. A short one keeps its
      // warning on screen, because that tab cannot tell that it is short
      // and neither could anyone reading it there.
      say(panel, collected.partial ? collected.note : "");
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
      listening = event.origin;
      give();
    }

    window.addEventListener("message", onMessage);

    rows.then(function (done) {
      if (!done) {
        // Nothing to hand over after all. The tab was opened on the
        // promise of a list, so it goes again rather than sitting on
        // "Waiting for the card list..." for good.
        window.removeEventListener("message", onMessage);
        opened.close();
        return;
      }
      collected = done;
      give();
    });
  }

  // sendToBan hands the rows over, reading them first if they are not
  // already in hand. How many clicks that takes depends on how long the
  // reading is, which is the only thing that decides it.
  function sendToBan(panel) {
    if (armed) {
      handOff(panel, Promise.resolve(armed));
      return;
    }
    if (hereOnly()) {
      // One page is a DOM read and one rates fetch, comfortably inside
      // the few seconds a click stays live. The tab opens now and the
      // rows are a moment behind it.
      handOff(panel, read(panel));
      return;
    }
    // The whole list is not: thirteen pages already outlives the click
    // and a hundred takes minutes. Opening the tab first would mean
    // watching an empty page while the count ticks along in the tab
    // behind it, so it is read first and handed over by a second click.
    read(panel).then(function (done) {
      if (!done) {
        return;
      }
      arm(panel, done);
      say(panel, done.note);
    });
  }

  // armed holds the rows a read produced, waiting for the click that will
  // open the tab to put them in.
  //
  // The reading and the opening are two clicks because they have to be.
  // window.open needs the click's transient activation, which lasts about
  // five seconds, and reading a hundred pages takes minutes - so the tab
  // cannot be opened after the reading. Opening it before the reading
  // works, but hands you an empty page to look at while the count ticks
  // along in the tab behind it. A click each is the way to have both.
  //
  // It is what the panel has read rather than what a particular button
  // read, so either button fills it and either button can spend it: no
  // walking a hundred pages twice because the file was wanted as well.
  var armed = null;

  function arm(panel, done) {
    armed = done;
    var send = panel.querySelector(".cm-banner-send");
    if (send) {
      send.textContent = "Send " + done.count + " rows";
    }
  }

  // disarm is for whenever the rows in hand stop describing what is on
  // offer: the table changed underneath them, or they were asked for at a
  // scope nobody is asking for any more.
  function disarm(panel) {
    armed = null;
    var send = panel.querySelector(".cm-banner-send");
    if (send) {
      send.textContent = SEND;
    }
  }

  // stopReading abandons whatever is running and puts the panel back as
  // it was.
  //
  // The rows go with it. A read that was stopped part way is not a
  // shorter export - offering one would be offering a fraction of a
  // collection as though it were the collection, which is the thing this
  // whole file is most careful about.
  function stopReading(panel) {
    generation++;
    busy(panel, false);
    disarm(panel);
    say(panel, "");
    label(panel);
  }

  // shown is the row count the panel last named, so a change in the page can
  // be told from the page merely being touched.
  var shown = -1;

  function label(panel) {
    var count = MKM.countRows(document);
    var says = panel.querySelector(".cm-banner-scope");
    if (says) {
      // Naming the wrong scope is how a twentieth of a collection gets
      // uploaded as all of it, so the button says which it means.
      says.textContent = SCOPES[scope].says;
    }
    var button = panel.querySelector(".cm-banner-label");
    if (button) {
      // The number lives here rather than in the label, which now names a
      // scope instead of a count. It is written the way Cardmarket wrote
      // it: a seller past the paging limit reads "2000+", and rounding
      // that to 2000 promises an exact figure that is not one.
      var listed = MKM.totalSaid(document) || String(count);
      button.title = hereOnly()
        ? count + " offers on this page \u2014 click for the whole list"
        : listed + " offers listed \u2014 click for this page";
    }
    panel.hidden = count === 0;
    shown = count;
    return count;
  }

  function build() {
    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<button type="button" class="cm-banner-label">' +
      'CM BANNER - <b class="cm-banner-scope"></b>' +
      "</button>" +
      '<div class="cm-banner-actions">' +
      '<button type="button" class="cm-banner-send">' + SEND + "</button>" +
      '<button type="button" class="cm-banner-save">CSV</button>' +
      "</div>" +
      '<div class="cm-banner-note">' +
      '<span class="cm-banner-spin" aria-hidden="true"></span>' +
      '<span class="cm-banner-text"></span>' +
      "</div>";

    // Changing what will be taken makes whatever the last export said
    // about the other scope stale, so the note goes with it.
    panel.querySelector(".cm-banner-label").addEventListener("click", function () {
      scope = (scope + 1) % SCOPES.length;
      // Rows read for the other scope are not the rows now being asked
      // for, and the note about them is stale too.
      disarm(panel);
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

    // Escape stops a read and puts the panel back.
    //
    // On the document, because the panel holds no focus worth speaking of
    // - it is a box in the corner of somebody else's page, and the key has
    // to work wherever that page has left the cursor.
    //
    // It does nothing unless there is something of ours to stop, so
    // Cardmarket's own use of the key is untouched the rest of the time.
    // It does not preventDefault even then: closing a dialog of theirs and
    // stopping a read of ours are not in conflict.
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }
      if (!panel.classList.contains("cm-banner-busy") && !armed) {
        return;
      }
      stopReading(panel);
    });

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
        // The table itself moved, so rows read from it no longer describe
        // what is on offer, and what the last export said of it no longer
        // holds either.
        disarm(panel);
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
