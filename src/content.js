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
  // What the file button says. It is the quieter of the two while there
  // are two, and says the whole thing when it is alone - the panel is a
  // fixed width, so the longer word is what keeps the row from shrinking
  // to the size of one small button.
  // What the line says to a visitor Cardmarket has not signed in. It is
  // the one message that is a standing condition rather than something
  // that just happened, so it is on screen from the moment the panel is
  // and stays there until the page is reloaded signed in.
  var SIGN_IN = "Sign in to Cardmarket to read the whole list";
  var SAVE = "CSV";
  var SAVE_ALONE = "Download CSV";
  // What the button says once the rows are read and waiting for the click
  // that sends them. The count is not on it: it goes in the heading, which
  // has room and is otherwise repeating a scope that was chosen before the
  // read and has not changed since.
  //
  // Not called READY - that name is taken, by the message the site's
  // handoff page sends when it is listening, and the two are one keyword
  // apart from silently swapping places.
  var ARMED = "READY";
  var READY = "mtgban-handoff-ready";
  var ROWS = "mtgban-handoff-rows";

  // Each game is served by its own deployment. Magic is the default one and
  // answers at the bare domain: magic.mtgban.com redirects there, which
  // changes the origin on the way, so it is named as it ends up.
  //
  // All nine BAN prices are here, including the one Cardmarket does not
  // sell: what can be sent is the overlap of two lists, and the one that
  // moves is Cardmarket's - Gundam arrived there after the first seven
  // were wired up.
  //
  // Cardmarket's other fourteen games are not pages to stay off: the
  // offers table, the tooltips and the paging are one layout with a
  // different word in the path, so the read and the file are the same
  // work on any of them. Only the send has nowhere to go.
  var HOSTS = {
    magic: "mtgban.com",
    pokemon: "pokemon.mtgban.com",
    yugioh: "yugioh.mtgban.com",
    lorcana: "lorcana.mtgban.com",
    onepiece: "onepiece.mtgban.com",
    fleshandblood: "fleshandblood.mtgban.com",
    riftbound: "riftbound.mtgban.com",
    gundam: "gundam.mtgban.com",
    // No Cardmarket path names it yet, so this one waits rather than
    // works. It costs an entry; leaving it out costs a dead button on the
    // day it appears.
    palworld: "palworld.mtgban.com",
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

  // sendable says whether this page's game has a deployment behind it. The
  // path cannot change under a content script, so it answers the same
  // thing for the life of the panel.
  function sendable() {
    return !!uploadURL(gameFromPath(location.pathname));
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

  // say writes the line under the buttons, and takes the line away when
  // there is nothing to put on it. Most reads have nothing: the count goes
  // in the heading and the total goes on the button, so this is left with
  // the exceptions.
  function say(panel, message) {
    var note = panel.querySelector(".cm-banner-note");
    if (note) {
      note.textContent = message;
      note.hidden = !message;
      // The standing one is not a thing that went wrong, and reads as a
      // different kind of sentence.
      note.classList.toggle("cm-banner-signin", message === SIGN_IN);
    }
  }

  // resting is what the line says when there is nothing else to say.
  // Empty, as a rule - and not for a visitor who is not signed in, since
  // for them the missing scope is not an event that passed but the state
  // the panel is in, and a hover is a poor place to keep it.
  function resting() {
    return locked ? SIGN_IN : "";
  }

  // recap is what a finished read had to say about itself - what it
  // skipped, what it could not price - kept on the hover rather than on a
  // line of its own.
  //
  // It is a footnote to a number, not a thing to act on: a line under the
  // buttons for it sits there being read once and ignored after, and the
  // panel is small enough that a line it does not need is a line in the
  // way. The lines it does keep are the ones that ask for something - a
  // read that was refused, a pop-up that was blocked.
  //
  // Said on both the count and the mark beside it, so it answers whichever
  // of the two the cursor stopped on - and while it is up, the heading
  // itself says nothing.
  //
  // The heading is one button with the count inside it. A title there as
  // well is a second tooltip over the same few words, and which of the two
  // a reader gets depends on where the cursor crossed in: one already on
  // screen does not swap for the other until the pointer moves again. So
  // there is one at a time. `label()` puts the heading's own back when it
  // clears this.
  function recap(panel, text) {
    var parts = panel.querySelectorAll(".cm-banner-scope, .cm-banner-mark");
    for (var i = 0; i < parts.length; i++) {
      if (text) {
        parts[i].title = text;
      } else {
        parts[i].removeAttribute("title");
      }
    }
    var button = panel.querySelector(".cm-banner-label");
    if (button && text) {
      button.removeAttribute("title");
    }
  }

  // mark is the sign beside the count: a tick when a file was written, a
  // cross when a read came to nothing. One element rather than two, since
  // the panel never wants both and a pair would need keeping in step.
  //
  // The download itself is the browser's business once the anchor is
  // clicked and nothing here hears about it; what the tick says is that
  // the rows were read and handed over to it.
  function mark(panel, how) {
    var at = panel.querySelector(".cm-banner-mark");
    if (!at) {
      return;
    }
    at.hidden = !how;
    at.textContent = how === "failed" ? "\u2717" : "\u2713";
    at.classList.toggle("cm-banner-failed", how === "failed");
  }

  // counting puts the read's progress where the scope word usually is.
  //
  // The heading is a line the panel already has. Giving the count a line
  // of its own means keeping that line empty the rest of the time, since
  // one that came and went would move the buttons - and the count is only
  // there while the spinner is, which is the one moment the scope word is
  // not worth reading.
  function counting(panel, text) {
    var says = panel.querySelector(".cm-banner-scope");
    if (says) {
      says.textContent = text;
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

  // buttons puts the pair into the state the panel is in. Send has two
  // reasons to be out of reach and one outlives the other, so they are
  // decided together: a read ending must not hand back a button that was
  // never clickable in the first place.
  function buttons(panel, working) {
    var send = panel.querySelector(".cm-banner-send");
    var save = panel.querySelector(".cm-banner-save");
    if (send) {
      send.disabled = working || !sendable();
    }
    if (save) {
      save.disabled = working;
    }
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
    // The two that do something. The heading is left alone: it is holding
    // the count, and a disabled button is a dimmed one in every browser's
    // own stylesheet, so disabling it would dim the progress.
    buttons(panel, working);
    if (working) {
      window.addEventListener("beforeunload", hold);
    } else {
      window.removeEventListener("beforeunload", hold);
      // The heading was carrying the count. Give it its word back.
      label(panel);
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

  // locked is a panel with nowhere to move between. Cardmarket shows a
  // signed-out visitor page one and then a page with no rows on it, so
  // the whole list is not on offer to them and the heading stops being a
  // control. Set once, in install(), because a page does not sign in
  // under a content script.
  var locked = false;

  function hereOnly() {
    return SCOPES[scope].here;
  }

  // hereScope is the scope that takes the page in front of us, found
  // rather than written down so that the two cannot disagree.
  function hereScope() {
    for (var i = 0; i < SCOPES.length; i++) {
      if (SCOPES[i].here) {
        return i;
      }
    }
    return 0;
  }

  // thisPage answers in the shape a walk answers in, so that everything
  // downstream of it is the same code either way.
  function thisPage() {
    var offers = MKM.parseOffers(document, MKM.languageIDs(document));
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
    // Whatever the last read said of a different list, it no longer holds.
    say(panel, resting());

    var reading;
    if (hereOnly()) {
      reading = Promise.resolve(thisPage());
    } else {
      reading = MKM.walkPages(document, location.href, {
        cancelled: stale,
        languages: MKM.languageIDs(document),
        onProgress: function (at) {
          if (stale()) {
            return;
          }
          counting(panel, progress(at));
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
          // A read that was refused says why. It comes back with no rows
          // for the same reason it comes back with no answer, and
          // "None of the 0 offers here could be read" is a true sentence
          // that tells nobody to reload the page and pass the check.
          if (walked.stopped) {
            return { csv: "", note: walked.stopped };
          }
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
    // The page every row came from, which every row also links back to.
    // Read here and not in the parse, because a page fetched during a walk
    // knows its own address and not the seller's list it belongs to.
    var base = location.origin + location.pathname;
    // Read once, off the page being looked at rather than off each page the
    // walk fetched: the filter beside the table lists the whole seller's
    // expansions whichever of their pages is open.
    var expansions = MKM.expansionIDs(document);
    var unpriced = 0;
    offers.forEach(function (offer) {
      offer.priceUSD = MKM.priceUSD(offer.price, offer.currency, rates);
      offer.url = MKM.offerURL(base, offer, expansions);
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

    // A walk that ended before the pages did. Cardmarket answers a fetch
    // with a page holding no rows - which is what it serves a signed-out
    // visitor past page one - and a link leading to nothing is where a
    // pager stops, so the walk finishes without ever knowing it was cut
    // off. What comes out is page one wearing the shape of an inventory.
    //
    // Told apart from the ordinary shortfall by the size of it: an offer
    // sold mid-walk shifts the rest up a place and one falls between two
    // fetches, which is the note above. A whole page is not a sale.
    var missing = walked.expected ? walked.expected - walked.rows : 0;
    if (
      !walked.capped &&
      !walked.stopped &&
      walked.perPage > 0 &&
      missing >= walked.perPage
    ) {
      return {
        csv: "",
        note:
          "Only " + walked.rows + " of " + walked.expected +
          " offers came back, so nothing was saved",
      };
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
          mark(panel, "failed");
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
      mark(panel, "done");
      recap(panel, done.note ? "saved, " + done.note : "saved");
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
  // awaiting is the handoff listener still hoping to hear from a tab.
  //
  // The page it opens has no deadline on purpose - it answers when it has
  // loaded, and how long that takes is the network's business. But a tab
  // that never answers at all, or is closed before it does, would leave
  // its listener behind for the life of this page. One at a time is
  // enough to bound that: a second handoff retires the first.
  var awaiting = null;

  function handOff(panel, rows) {
    if (awaiting) {
      window.removeEventListener("message", awaiting);
      awaiting = null;
    }

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
        {
          type: ROWS,
          csv: collected.csv,
          rows: collected.count,
          // Where they were read. The site says "Results from Cardmarket -
          // <seller>" rather than "from pasted text", which is all a form
          // post looks like by the time it gets there. It decides what to
          // call this; what goes over is the page, filters and all, so the
          // heading can link back to the list these rows actually are.
          source: location.href,
        },
        listening
      );
      // Spent only once they have landed somewhere, so a tab that never
      // answered can be tried again without reading the pages afresh.
      disarm(panel);
      // Nothing is said of a whole list: the tab that just took it is the
      // answer and says more than this could. A short one keeps its
      // warning on screen, because that tab cannot tell that it is short
      // and neither could anyone reading it there.
      say(panel, collected.partial ? collected.note : resting());
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
      awaiting = null;
      listening = event.origin;
      give();
    }

    awaiting = onMessage;
    window.addEventListener("message", onMessage);

    rows.then(function (done) {
      if (!done) {
        // Nothing to hand over after all. The tab was opened on the
        // promise of a list, so it goes again rather than sitting on
        // "Waiting for the card list..." for good.
        window.removeEventListener("message", onMessage);
        awaiting = null;
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
    // Not where there is nothing to send to. The rows are real and the
    // count still goes up in the heading, but a button that cannot be
    // clicked saying READY is an offer that is not there.
    if (send && sendable()) {
      send.textContent = ARMED;
      // The pulse goes on with the word and for the same reason: both of
      // them are the offer, and there is no offer where nothing can take
      // the rows.
      panel.classList.add("cm-banner-armed");
    }
    counting(panel, done.count + (done.count === 1 ? " row" : " rows"));
    recap(panel, done.note);
  }

  // disarm is for whenever the rows in hand stop describing what is on
  // offer: the table changed underneath them, or they were asked for at a
  // scope nobody is asking for any more.
  function disarm(panel) {
    armed = null;
    mark(panel, "");
    panel.classList.remove("cm-banner-armed");
    var send = panel.querySelector(".cm-banner-send");
    if (send) {
      send.textContent = SEND;
    }
    // The heading was holding the count. Give it its word back.
    label(panel);
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
    say(panel, resting());
    label(panel);
  }

  // shown is what the table looked like when the panel last read it, so a
  // change in the page can be told from the page merely being touched.
  //
  // Not the row count alone: filtering to a different twenty offers, or
  // sorting the same twenty, leaves the count where it was while making
  // every row in hand describe something else. The first and last article
  // ids move whenever the rows do, and cost nothing to read.
  var shown = "";

  function tableState() {
    var rows = document.querySelectorAll('[id^="stockRow"]');
    if (rows.length === 0) {
      return "0";
    }
    return rows.length + ":" + rows[0].id + ":" + rows[rows.length - 1].id;
  }

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
      button.title = locked
        ? SIGN_IN + " \u2014 it shows a visitor this page and no more"
        : hereOnly()
          ? count + " offers on this page \u2014 click for the whole list"
          : listed + " offers listed \u2014 click for this page";
    }
    recap(panel, "");
    panel.hidden = count === 0;
    shown = tableState();
    return count;
  }

  function build() {
    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<button type="button" class="cm-banner-label">' +
      'CM BAN<i class="cm-banner-ner">ner</i> - ' +
      '<span class="cm-banner-spin" aria-hidden="true"></span>' +
      '<b class="cm-banner-scope"></b>' +
      '<span class="cm-banner-mark" aria-hidden="true" hidden>\u2713</span>' +
      "</button>" +
      '<div class="cm-banner-actions">' +
      '<button type="button" class="cm-banner-send">' + SEND + "</button>" +
      '<button type="button" class="cm-banner-save">' + SAVE + "</button>" +
      "</div>" +
      '<div class="cm-banner-note" hidden></div>';

    // Changing what will be taken makes whatever the last export said
    // about the other scope stale, so the note goes with it.
    panel.querySelector(".cm-banner-label").addEventListener("click", function () {
      // Not while a read is running: this line is showing the count, and
      // switching scope would write over it and abandon a read that was
      // asked for under the other one.
      if (panel.classList.contains("cm-banner-busy")) {
        return;
      }
      // Nowhere to move between; the heading says why on its hover.
      if (locked) {
        return;
      }
      scope = (scope + 1) % SCOPES.length;
      // Rows read for the other scope are not the rows now being asked
      // for, and the note about them is stale too.
      disarm(panel);
      say(panel, resting());
      label(panel);
    });
    panel.querySelector(".cm-banner-send").addEventListener("click", function () {
      sendToBan(panel);
    });
    panel.querySelector(".cm-banner-save").addEventListener("click", function () {
      exportOffers(panel);
    });
    // A game BAN does not price gets the panel, the read and the file all
    // the same. What it does not get is the send button: there is no
    // deployment to open, and a button that says so is a button explaining
    // itself for ever in a panel three words wide. The file button takes
    // the row and says what it does instead.
    if (!sendable()) {
      panel.querySelector(".cm-banner-send").hidden = true;
      panel.querySelector(".cm-banner-save").textContent = SAVE_ALONE;
    }
    buttons(panel, false);
    return panel;
  }

  function install() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    // Asked before the panel is drawn, since it decides what the panel
    // opens on: a signed-out visitor is shown page one and a page with no
    // rows after it, so the whole list is not something to offer them.
    locked = MKM.loggedOut(document);
    if (locked) {
      scope = hereScope();
    }

    var panel = build();
    panel.classList.toggle("cm-banner-locked", locked);
    document.body.appendChild(panel);
    label(panel);
    say(panel, resting());

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
        if (tableState() === shown) {
          return;
        }
        // The table itself moved, so rows read from it no longer describe
        // what is on offer, and what the last export said of it no longer
        // holds either.
        disarm(panel);
        say(panel, resting());
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
