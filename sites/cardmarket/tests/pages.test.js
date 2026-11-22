import { test, expect, describe } from "bun:test";
import { load, pageOf, text, MKM } from "./helpers.js";
import { Window } from "happy-dom";

const BASE = "https://www.cardmarket.com/en/Magic/Users/Seller/Offers/Singles";

function docOf(html) {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document;
}

describe("finding the next page", () => {
  test("the server's relative href is resolved against the page it came from", () => {
    // The live server writes "/en/Magic/Users/Seller/Offers/Singles?site=3".
    // Handing that to fetch unresolved works by accident on the page itself
    // and not at all on a document parsed out of a response.
    expect(MKM.nextPageURL(docOf(text("pager-next.html")), BASE + "?site=2")).toBe(
      BASE + "?site=3"
    );
  });

  test("an absolute href is taken as it stands", () => {
    // Which is how the same control reads on a page saved out of a browser,
    // after Cardmarket's own scripts have been over it.
    const absolute =
      '<a href="https://www.cardmarket.com/en/Magic/Users/Seller/Offers/Singles?idLanguages=1&sortBy=name_asc&site=3"' +
      ' role="button" aria-label="Next page" data-direction="next"' +
      ' class="btn btn-primary btn-sm ms-3 pagination-control"></a>';
    expect(MKM.nextPageURL(docOf(absolute), BASE)).toBe(
      BASE + "?idLanguages=1&sortBy=name_asc&site=3"
    );
  });

  test("the last page has no next page", () => {
    // Cardmarket draws the control anyway, with no href and a disabled
    // class. Both say the same thing and either one alone would do.
    expect(MKM.nextPageURL(docOf(text("pager-last.html")), BASE)).toBe("");
  });

  test("a page with no pager at all has no next page", () => {
    expect(MKM.nextPageURL(load("offers.html"), BASE)).toBe("");
  });
});

describe("finding the first page", () => {
  test("the first page is the list without a site", () => {
    expect(MKM.firstPageURL(BASE + "?site=7")).toBe(BASE);
  });

  test("the filter in force comes with it", () => {
    // Whatever the seller's page is filtered to is the list being exported,
    // so dropping the query on the way to page one would export a different
    // list from the one on screen.
    expect(MKM.firstPageURL(BASE + "?idLanguages=1&sortBy=name_asc&site=7")).toBe(
      BASE + "?idLanguages=1&sortBy=name_asc"
    );
  });

  test("a page already at the top answers with nothing to fetch", () => {
    expect(MKM.firstPageURL(BASE)).toBe("");
    expect(MKM.firstPageURL(BASE + "?idLanguages=1")).toBe("");
  });
});

describe("the hit count", () => {
  test("it is the number beside the pager, not the sentence", () => {
    expect(MKM.totalCount(docOf(text("pager-next.html")))).toBe(1093);
  });

  test("grouped thousands are read whichever way they are grouped", () => {
    // "Page 5 of 13" is written in whichever of Cardmarket's languages the
    // visitor reads; so is the grouping of the number beside it.
    expect(MKM.totalCount(docOf('<span class="total-count">1.093</span>'))).toBe(1093);
    expect(MKM.totalCount(docOf('<span class="total-count">1,093</span>'))).toBe(1093);
  });

  test("a page that does not say is not guessed at", () => {
    expect(MKM.totalCount(load("offers.html"))).toBe(0);
    expect(MKM.totalSaid(load("offers.html"))).toBe("");
  });
});

describe("Cardmarket's paging ceiling", () => {
  // It pages a seller's offers to 100 pages of twenty and no further,
  // saying so with a plus on both numbers: "2000+ Hits", "Page 100 of
  // 100+". Page 100's next-page control is disabled exactly as a real
  // last page's is, so the walk ends there tidily either way.
  const ceiling = () => docOf(text("pager-capped.html"));

  test("the plus is carried, not rounded away", () => {
    // "Export 2000 offers" off a ten-thousand-offer seller is a promise
    // of an exact figure that is not one.
    expect(MKM.totalSaid(ceiling())).toBe("2000+");
    expect(MKM.capped(ceiling())).toBe(true);
  });

  test("the number behind it is still usable for counting up to", () => {
    expect(MKM.totalCount(ceiling())).toBe(2000);
  });

  test("an ordinary last page is not capped", () => {
    expect(MKM.capped(docOf(text("pager-last.html")))).toBe(false);
    expect(MKM.capped(docOf(text("pager-next.html")))).toBe(false);
  });

  test("a capped listing ends the walk and says it was capped", async () => {
    // Nothing in the rows says a fifth of the seller is all that came
    // back. Only the plus says it, so the walk has to carry it out.
    const walked = await MKM.walkPages(pageOf({ pager: "pager-capped.html" }), BASE, {
      fetchPage: () => Promise.reject(new Error("should not be asked")),
      pace: 0,
    });
    expect(walked.pages).toBe(1);
    expect(walked.capped).toBe(true);
    expect(walked.stopped).toBe("");
  });

  test("a walk that reached the true end is not capped", async () => {
    const walked = await MKM.walkPages(pageOf({ total: 11 }), BASE, { pace: 0 });
    expect(walked.capped).toBe(false);
  });
});

describe("walking the list", () => {
  // A seller with three pages. Each page's rows are the fixture's with
  // their article ids moved along, which is what tells one page's rows
  // from another's.
  function seller() {
    const pages = {
      [BASE]: pageOf({ offset: 0, next: BASE + "?site=2", total: 42 }),
      [BASE + "?site=2"]: pageOf({ offset: 100, next: BASE + "?site=3", total: 42 }),
      [BASE + "?site=3"]: pageOf({ offset: 200, total: 42 }),
    };
    const asked = [];
    return {
      asked,
      fetchPage(url) {
        asked.push(url);
        return pages[url]
          ? Promise.resolve(pages[url])
          : Promise.reject(new Error("Cardmarket answered 404"));
      },
    };
  }

  test("every page lands in the one list", async () => {
    const site = seller();
    const walked = await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: site.fetchPage,
      pace: 0,
    });

    const onePage = MKM.parseOffers(load("offers.html")).length;
    expect(walked.pages).toBe(3);
    expect(walked.offers.length).toBe(onePage * 3);
    // Every article id distinct: three pages of the same fixture would
    // collapse to one page's worth if the ids had not moved, and that is
    // the failure this is watching for.
    expect(new Set(walked.offers.map((o) => o.articleID)).size).toBe(onePage * 3);
    expect(walked.expected).toBe(42);
  });

  test("it reports how big a page was, for measuring a shortfall in pages", async () => {
    // A row missing is an offer sold mid-walk. A page missing is a walk
    // that ended before the pages did, and only the second is a failure -
    // so the size of a page is what the difference has to be measured in.
    const site = seller();
    const walked = await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: site.fetchPage,
      pace: 0,
    });
    expect(walked.perPage).toBe(MKM.countRows(load("offers.html")));
    expect(walked.rows).toBe(walked.perPage * 3);
  });

  test("a page with no rows ends the walk, and the count says so", async () => {
    // What Cardmarket serves a visitor it has not signed in, past page
    // one. A link leading to an empty page is where a pager stops, so
    // nothing here fails - the walk simply finishes early, holding one
    // page and a total that says there were forty-two.
    const walked = await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: () => Promise.resolve(docOf("<html><body></body></html>")),
      pace: 0,
    });

    expect(walked.pages).toBe(1);
    expect(walked.stopped).toBe("");
    expect(walked.expected).toBe(42);
    expect(walked.rows).toBe(walked.perPage);
    // Which is the whole difficulty: nothing about this walk announces
    // itself as short, and the caller has to work it out from the
    // numbers.
    expect(walked.expected - walked.rows).toBeGreaterThanOrEqual(walked.perPage);
  });

  test("it starts at page one however far in the seller's page was left", async () => {
    // Walking forward from page five would drop the first four pages and
    // hand over a file that looks complete.
    const site = seller();
    const walked = await MKM.walkPages(pageOf({ next: "", total: 42 }), BASE + "?site=3", {
      fetchPage: site.fetchPage,
      pace: 0,
    });
    expect(site.asked[0]).toBe(BASE);
    expect(walked.pages).toBe(3);
  });

  test("the page in hand is not fetched again when it is already page one", async () => {
    const site = seller();
    await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: site.fetchPage,
      pace: 0,
    });
    expect(site.asked).toEqual([BASE + "?site=2", BASE + "?site=3"]);
  });

  test("progress is reported a page at a time", async () => {
    const site = seller();
    const seen = [];
    await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: site.fetchPage,
      pace: 0,
      onProgress: (at) => seen.push(at.pages + ":" + at.offers),
    });
    const onePage = MKM.parseOffers(load("offers.html")).length;
    expect(seen).toEqual([`1:${onePage}`, `2:${onePage * 2}`, `3:${onePage * 3}`]);
  });

  test("a row seen twice is carried once", async () => {
    // A sale between two fetches shifts every later offer up a place, and
    // the row on the boundary is shown again on the next page.
    const pages = {
      [BASE]: pageOf({ offset: 0, next: BASE + "?site=2", total: 42 }),
      [BASE + "?site=2"]: pageOf({ offset: 0, total: 42 }),
    };
    const walked = await MKM.walkPages(pages[BASE], BASE, {
      fetchPage: (url) => Promise.resolve(pages[url]),
      pace: 0,
    });
    const onePage = MKM.parseOffers(load("offers.html")).length;
    expect(walked.pages).toBe(2);
    // Every row was read twice; only the offers behind them are deduped.
    expect(walked.rows).toBe(MKM.countRows(load("offers.html")) * 2);
    expect(walked.offers.length).toBe(onePage);
  });

  test("a walk that is refused keeps what it read and says it stopped", async () => {
    // Cardmarket answering 429 half way through is a short list that would
    // otherwise read as the whole inventory.
    const walked = await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: () => Promise.reject(new Error("Cardmarket answered 429")),
      pace: 0,
    });
    expect(walked.pages).toBe(1);
    expect(walked.offers.length).toBeGreaterThan(0);
    expect(walked.stopped).toBe("Cardmarket answered 429");
  });

  test("a page with no rows on it ends the walk", async () => {
    const empty = docOf(text("pager-next.html"));
    const walked = await MKM.walkPages(pageOf({ next: BASE + "?site=2", total: 42 }), BASE, {
      fetchPage: () => Promise.resolve(empty),
      pace: 0,
    });
    expect(walked.pages).toBe(1);
    expect(walked.stopped).toBe("");
  });

  test("a pager pointing back at a page already read ends the walk", async () => {
    // Nothing here counts pages, so a loop would otherwise be forever.
    const loop = pageOf({ offset: 0, next: BASE + "?site=2", total: 42 });
    const walked = await MKM.walkPages(loop, BASE, {
      fetchPage: () => Promise.resolve(loop),
      pace: 0,
    });
    expect(walked.pages).toBe(2);
  });
});

describe("not looking like a bot", () => {
  test("it waits between pages", async () => {
    // Cardmarket sits behind Cloudflare and three fetches inside a second
    // were answered with a challenge rather than a page.
    const at = [];
    const pages = {
      [BASE]: pageOf({ offset: 0, next: BASE + "?site=2", total: 42 }),
      [BASE + "?site=2"]: pageOf({ offset: 100, next: BASE + "?site=3", total: 42 }),
      [BASE + "?site=3"]: pageOf({ offset: 200, total: 42 }),
    };
    const started = Date.now();
    await MKM.walkPages(pages[BASE], BASE, {
      pace: 40,
      fetchPage: (url) => {
        at.push(Date.now() - started);
        return Promise.resolve(pages[url]);
      },
    });
    expect(at.length).toBe(2);
    // Before each fetch and not after the last, so a one-page seller pays
    // nothing for the pacing at all.
    expect(at[0]).toBeGreaterThanOrEqual(35);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(35);
  });

  test("a one-page seller waits for nothing", async () => {
    const started = Date.now();
    await MKM.walkPages(pageOf({ total: 11 }), BASE, { pace: 500 });
    expect(Date.now() - started).toBeLessThan(200);
  });

  test("a Cloudflare challenge is told apart from an ordinary refusal", async () => {
    // Both come back 429. Only one of them is worth waiting out, and it is
    // not this one: nothing an extension can send answers a check meant
    // for the person at the keyboard.
    const saved = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve({
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "cf-mitigated" ? "challenge" : null) },
        text: () => Promise.resolve("<html><title>Just a moment...</title></html>"),
      });
    try {
      expect(MKM.fetchPage(BASE)).rejects.toThrow(MKM.CHALLENGE);
    } finally {
      globalThis.fetch = saved;
    }
  });

  test("an ordinary refusal says what it was", async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: () => Promise.resolve(""),
      });
    try {
      expect(MKM.fetchPage(BASE)).rejects.toThrow("Cardmarket answered 503");
    } finally {
      globalThis.fetch = saved;
    }
  });
});

describe("being told to stop", () => {
  const three = () => ({
    [BASE]: pageOf({ offset: 0, next: BASE + "?site=2", total: 42 }),
    [BASE + "?site=2"]: pageOf({ offset: 100, next: BASE + "?site=3", total: 42 }),
    [BASE + "?site=3"]: pageOf({ offset: 200, total: 42 }),
  });

  test("a page already in flight is dropped, not counted", async () => {
    // A fetch cannot be recalled. What can be done is refuse to keep
    // what it brought back, because rows nobody asked for any more are
    // not a shorter export - they are somebody else's.
    const pages = three();
    let stop = false;
    const walked = await MKM.walkPages(pages[BASE], BASE, {
      pace: 0,
      cancelled: () => stop,
      fetchPage: (url) => {
        stop = true;
        return Promise.resolve(pages[url]);
      },
    });
    expect(walked.pages).toBe(1);
    expect(walked.cancelled).toBe(true);
  });

  test("no page is asked for once nobody is waiting for it", async () => {
    // Cardmarket is behind a request budget worth not spending on an
    // answer that will be thrown away.
    const asked = [];
    const walked = await MKM.walkPages(
      pageOf({ next: BASE + "?site=2", total: 42 }),
      BASE,
      {
        pace: 0,
        cancelled: () => true,
        fetchPage: (url) => {
          asked.push(url);
          return Promise.resolve(pageOf({ total: 42 }));
        },
      }
    );
    expect(asked).toEqual([]);
    // The page already on screen is read before anything could be
    // stopped, and cost nothing to read.
    expect(walked.pages).toBe(1);
  });

  test("a walk nobody stopped says so", async () => {
    const pages = three();
    const walked = await MKM.walkPages(pages[BASE], BASE, {
      pace: 0,
      fetchPage: (url) => Promise.resolve(pages[url]),
    });
    expect(walked.cancelled).toBe(false);
    expect(walked.pages).toBe(3);
  });
});

describe("a request that goes nowhere", () => {
  test("a read that timed out says so in words", async () => {
    // The browser's own wording is "signal timed out", which names the
    // mechanism rather than what happened.
    const saved = globalThis.fetch;
    globalThis.fetch = () => {
      const err = new Error("signal timed out");
      err.name = "TimeoutError";
      return Promise.reject(err);
    };
    try {
      expect(MKM.fetchPage(BASE)).rejects.toThrow("Cardmarket did not answer in time");
    } finally {
      globalThis.fetch = saved;
    }
  });

  test("every page is asked for with a deadline on it", async () => {
    // Without one, a connection accepted and then left quiet is the one
    // failure with no symptom: the walk waits and the spinner turns.
    const saved = globalThis.fetch;
    let asked = null;
    globalThis.fetch = (url, options) => {
      asked = options;
      return Promise.reject(new Error("done looking"));
    };
    try {
      await MKM.fetchPage(BASE).catch(() => {});
      expect(asked).not.toBeNull();
      expect("signal" in asked).toBe(true);
    } finally {
      globalThis.fetch = saved;
    }
  });
});
