// Walks a seller's offers across Cardmarket's pagination.
//
// Cardmarket puts twenty offers on a page and draws a next-page control
// above and below the table. The walk follows that control rather than
// counting: on the last page Cardmarket draws the same <a> with no href and
// a "disabled" class, so "is there another page" and "does the link have an
// href" are the same question, and neither depends on a total that can move
// while the walk is running.
//
// One page at a time and slowly, because Cardmarket sits behind
// Cloudflare and a burst of fetches is read as a bot. Measured: a plain
// curl is refused outright with a 403, and three fetches inside a second
// were answered with a Cloudflare challenge instead of a page - after
// which nothing this can send will be answered at all until the visitor
// passes the check in a tab of their own.
//
// So the walk paces itself, and when it is challenged anyway it stops and
// says so rather than retrying into a door that is being held shut.

globalThis.MKM = globalThis.MKM || {};

(function (MKM) {
  "use strict";

  var NEXT = 'a[data-direction="next"]';

  // PACE is how long to leave between pages.
  //
  // This is a judgement, not a published limit: Cardmarket does not say
  // what its ceiling is, and finding it properly would mean hammering
  // someone's site until they stopped answering. Three requests inside a
  // second is known to be too fast. Roughly one a second is the pace of
  // somebody clicking "next" and reading, which is what this is pretending
  // to be, and it is the number here most worth revisiting against a real
  // export.
  var PACE = 1200;

  // CHALLENGE is what the panel says when Cloudflare wants the visitor
  // rather than us. Phrased as something to do, because there is something
  // to do and it is not "try again immediately".
  MKM.CHALLENGE = "Cardmarket is checking the browser; reload and try again";

  // challenged says whether Cloudflare answered instead of Cardmarket. It
  // comes back as a 403 or a 429 carrying a "Just a moment..." page, told
  // apart from an ordinary refusal by the header Cloudflare sets on it.
  //
  // Retrying is the wrong move. This is not a rate limit that lapses while
  // we wait, and nothing in an extension can answer a challenge meant for
  // a person.
  function challenged(response) {
    return response.headers.get("cf-mitigated") === "challenge";
  }

  function after(ms) {
    if (!ms) {
      return Promise.resolve();
    }
    return new Promise(function (resume) {
      setTimeout(resume, ms);
    });
  }

  // nextPageURL answers with the next page's address, or "" at the end.
  //
  // The href is resolved against the page it was read from, because the two
  // places it can be read from disagree: the server writes it relative
  // ("/en/Magic/Users/Lemhast/Offers/Singles?site=3") and a page saved out
  // of a browser carries it absolute. Only the first of those is what a
  // fetch will actually be handed.
  //
  // Whatever filter is in force comes along in it - Cardmarket writes the
  // query it was given back into the link - so a walk reads the list the
  // seller's page is currently showing rather than their whole shelf.
  function nextPageURL(root, base) {
    var links = root.querySelectorAll(NEXT);
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href");
      // The last page's control is drawn with neither of these.
      if (!href || links[i].classList.contains("disabled")) {
        continue;
      }
      try {
        return new URL(href, base).href;
      } catch (err) {
        return "";
      }
    }
    return "";
  }

  // firstPageURL is the same list seen from the top. Cardmarket numbers
  // pages with a "site" parameter and leaves it off the first one, which is
  // what page two's own previous-page link points at.
  //
  // It matters because the walk has to start there rather than wherever the
  // seller's page happened to be left. Walking forward from page five and
  // calling it an export would quietly drop the first four pages, and the
  // file would look complete.
  function firstPageURL(href) {
    var url;
    try {
      url = new URL(href);
    } catch (err) {
      return "";
    }
    if (!url.searchParams.has("site")) {
      return "";
    }
    url.searchParams.delete("site");
    return url.href;
  }

  // totalCount is how many offers the seller has under the filter in force.
  //
  // It is read from the number Cardmarket prints beside the pager and not
  // from "Page 5 of 13" beside it, because that sentence is written in
  // whichever of Cardmarket's languages the visitor reads and the number is
  // not.
  // totalSaid is the hit count exactly as Cardmarket prints it, which is
  // not always a number. A listing longer than Cardmarket will page
  // through says "2000+", and the plus is the whole point.
  function totalSaid(root) {
    var counted = root.querySelector(".total-count");
    return counted ? (counted.textContent || "").trim() : "";
  }

  // capped says whether Cardmarket is refusing to show the rest of the
  // list.
  //
  // It pages a seller's offers to 100 pages of twenty and no further,
  // marking both numbers with a plus - "2000+ Hits", "Page 100 of 100+".
  // Page 100's next-page control is then disabled exactly as a genuine
  // last page's is, so the walk ends there tidily with nothing in the
  // rows to say that a fifth of a ten-thousand-offer seller is all that
  // came back. Only the plus says it, so the plus has to be carried.
  function capped(root) {
    return totalSaid(root).indexOf("+") !== -1;
  }

  function totalCount(root) {
    var counted = root.querySelector(".total-count");
    if (!counted) {
      return 0;
    }
    // Grouped above a thousand by a full stop or a comma, depending again
    // on the language: "1.093" and "1,093" are both 1093.
    var digits = (counted.textContent || "").replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }

  // fetchPage asks for a page the way clicking "next" would.
  //
  // The request goes from cardmarket.com to cardmarket.com, so it is
  // same-origin, needs no permission and carries the session. That is also
  // what makes it acceptable to Cardmarket: the same request made from
  // outside a browser is answered with a 403.
  function fetchPage(url) {
    return fetch(url, {
      credentials: "same-origin",
      // Asked for the way a page load asks for it. A request for an HTML
      // page that says it will take anything is one of the things that
      // makes a fetch look unlike somebody reading.
      headers: { Accept: "text/html,application/xhtml+xml" },
    })
      .then(function (response) {
        if (challenged(response)) {
          throw new Error(MKM.CHALLENGE);
        }
        if (!response.ok) {
          throw new Error("Cardmarket answered " + response.status);
        }
        return response.text();
      })
      .then(function (text) {
        return new DOMParser().parseFromString(text, "text/html");
      });
  }

  // walkPages reads the seller's whole list, from the first page to the
  // last, and answers with the offers and what it cost to get them.
  //
  // Rows come back in page order and are deduped by article id. The walk is
  // not atomic: a sale between two fetches shifts every later offer up a
  // place, which can show one row twice - the dedupe covers that - and can
  // hide another, which nothing here can cover. What comes back says how
  // many were read against how many the page promised, so a walk that lost
  // one can be seen to have lost it.
  MKM.walkPages = function (doc, href, options) {
    var opts = options || {};
    var get = opts.fetchPage || fetchPage;
    var onProgress = opts.onProgress || function () {};
    var pace = opts.pace === undefined ? PACE : opts.pace;

    var expected = totalCount(doc);
    var ceiling = capped(doc);
    var offers = [];
    var seen = Object.create(null);
    var visited = Object.create(null);
    var pages = 0;
    var rows = 0;
    var stopped = "";

    function take(page) {
      pages++;
      rows += MKM.countRows(page);
      var found = MKM.parseOffers(page);
      for (var i = 0; i < found.length; i++) {
        if (seen[found[i].articleID]) {
          continue;
        }
        seen[found[i].articleID] = true;
        offers.push(found[i]);
      }
      onProgress({ pages: pages, offers: offers.length, expected: expected });
    }

    function step(page, at) {
      var next = nextPageURL(page, at);
      // A page already read is the end of the walk as surely as no link at
      // all: Cardmarket does not loop, so a link back to somewhere visited
      // means the shape of the pager changed, not that there is more.
      if (!next || visited[next]) {
        return Promise.resolve();
      }
      visited[next] = true;
      // The wait goes before the fetch and not after it, so the last page
      // does not cost one.
      return after(pace)
        .then(function () {
          return get(next);
        })
        .then(
          function (fetched) {
            // A page holding no rows ends it too. A link leading nowhere
            // is what a redesign looks like from here, and carrying on
            // past it asks Cardmarket for pages nobody is reading.
            if (MKM.countRows(fetched) === 0) {
              return;
            }
            take(fetched);
            return step(fetched, next);
          },
          function (err) {
            // What has been read is still worth having. The caller is
            // told the walk ended early rather than handed a short list
            // that looks like the whole inventory.
            stopped = err && err.message ? err.message : String(err);
          }
        );
    }

    function done() {
      return {
        offers: offers,
        pages: pages,
        rows: rows,
        expected: expected,
        // Not "how many were read" but "was there more that Cardmarket
        // would not show", which is a different kind of short.
        capped: ceiling,
        stopped: stopped,
      };
    }

    var first = firstPageURL(href);
    if (!first) {
      // Already at the top, so the document in hand is the first page and
      // there is nothing to fetch for it.
      visited[href] = true;
      take(doc);
      return step(doc, href).then(done);
    }

    visited[first] = true;
    return get(first)
      .then(function (fetched) {
        take(fetched);
        return step(fetched, first);
      })
      .catch(function (err) {
        stopped = err && err.message ? err.message : String(err);
      })
      .then(done);
  };

  MKM.PACE = PACE;
  MKM.nextPageURL = nextPageURL;
  MKM.firstPageURL = firstPageURL;
  MKM.totalCount = totalCount;
  MKM.totalSaid = totalSaid;
  MKM.capped = capped;
  MKM.fetchPage = fetchPage;
})(globalThis.MKM);
