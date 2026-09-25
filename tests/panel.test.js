import { test, expect, describe } from "bun:test";
import { mount, OFFERS } from "./panel.js";

// A game Cardmarket sells and BAN does not price. Its offers pages are the
// same markup with a different word in the path - checked against the live
// site, not against the fixture: one row, one expansion tooltip, one
// item-count and a next-page link, all where Magic keeps them.
const UNPRICED =
  "https://www.cardmarket.com/en/Digimon/Users/Seller/Offers/Singles";

describe("the panel", () => {
  test("it appears on a game BAN prices", () => {
    expect(mount().panel).not.toBeNull();
  });

  test("and on one it cannot send anywhere, minus the sending", () => {
    // Cardmarket sells about twenty games. The read and the file are the
    // same work on every one of them, so the panel appears and writes a
    // CSV. The send button is not disabled but gone: a panel three words
    // wide has no room for a button explaining itself for ever.
    const other = mount({ url: UNPRICED });
    expect(other.panel).not.toBeNull();
    expect(other.send().hidden).toBe(true);
    // The file button takes the row it left and says what it does, so the
    // panel is the same width either way.
    expect(other.save().textContent).toBe("Download CSV");
    expect(other.save().disabled).toBe(false);
  });

  test("and a read there never arms the button that is not on the panel", async () => {
    // The rows are real and the heading counts them, but READY belongs to
    // a button nobody can see - and busy() putting the buttons back must
    // not put that one back either.
    const other = mount({ url: UNPRICED });
    other.save().click();
    await other.settle();
    expect(other.scope()).toBe("11 rows");
    expect(other.send().hidden).toBe(true);
    expect(other.send().textContent).toBe("Send to BAN");
    // Nor the pulse, which would be a ring drawn around a button that is
    // not on the panel.
    expect(other.armed()).toBe(false);
    expect(other.save().textContent).toBe("Download CSV");
    expect(other.save().disabled).toBe(false);
  });

  test("and sends from a game Cardmarket added after this was written", () => {
    // Gundam reached Cardmarket after the first seven were wired up, and
    // BAN prices it. What can send is the overlap of the two lists, and
    // only Cardmarket's moves.
    const it = mount({
      url: "https://www.cardmarket.com/en/Gundam/Users/Seller/Offers/Singles",
    });
    expect(it.send().hidden).toBe(false);
    expect(it.send().disabled).toBe(false);
    expect(it.save().textContent).toBe("CSV");
    it.toggleScope();
    it.send().click();
    expect(it.opened[0]).toBe("https://gundam.mtgban.com/upload/handoff");
  });

  test("the heading names the scope, and clicking it changes it", () => {
    const it = mount();
    expect(it.heading()).toBe("CM BANner - all offers");
    expect(it.scope()).toBe("all offers");
    it.toggleScope();
    expect(it.heading()).toBe("CM BANner - this page only");
    it.toggleScope();
    expect(it.scope()).toBe("all offers");
  });
});

describe("clicking send", () => {
  test("one page opens the tab on the click itself", async () => {
    // Nothing slow stands between the click and the window, because
    // window.open needs that click.
    const it = mount();
    it.toggleScope();
    it.send().click();
    expect(it.opened[0]).toBe("https://mtgban.com/upload/handoff");
  });

  test("the whole list reads first and opens nothing yet", async () => {
    const it = mount();
    it.send().click();
    expect(it.busy()).toBe(true);
    expect(it.send().disabled).toBe(true);
    // The count takes the heading's word while it reads, and no line is
    // opened underneath for it.
    expect(it.scope()).toBe("11 / 14");
    expect(it.noteShown()).toBe(false);
    await it.settle();
    expect(it.opened).toEqual([]);
    // The button becomes the second click, and the heading keeps the
    // count rather than going back to repeating the scope.
    expect(it.send().textContent).toBe("READY");
    // And it says so in the one way a panel in the corner of a page can
    // say anything without being read: it pulses.
    expect(it.armed()).toBe(true);
    expect(it.scope()).toBe("11 rows");
    expect(it.busy()).toBe(false);
    expect(it.send().disabled).toBe(false);
  });

  test("the heading is not dimmed while it reads", async () => {
    // It is holding the count, which is the one thing on the panel worth
    // reading at that moment. Disabling a button dims it in every
    // browser's own stylesheet, so the heading is not disabled - it just
    // declines the click.
    const it = mount();
    it.send().click();
    expect(it.busy()).toBe(true);
    expect(it.send().disabled).toBe(true);
    expect(it.save().disabled).toBe(true);
    expect(it.label().disabled).toBe(false);
    await it.settle();
  });

  test("and clicking it mid-read neither switches scope nor writes over the count", async () => {
    const it = mount({ pager: "pager-next.html", total: 1093 });
    it.send().click();
    const counting = it.scope();
    it.label().click();
    expect(it.scope()).toBe(counting);
    it.escape();
    // The scope is where it was left, not one click along from it.
    expect(it.scope()).toBe("all offers");
  });

  test("a read that was refused says why, not how many rows it did not get", async () => {
    // Starting mid-list, the first thing a walk does is fetch page one.
    // When that is refused there are no rows and no pages, and the count
    // of what was missed is the least useful thing to say about it.
    const it = mount({
      url: OFFERS + "?site=4",
      pager: "pager-next.html",
      total: 1093,
    });
    it.window.fetch = () =>
      Promise.resolve({
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "cf-mitigated" ? "challenge" : null) },
        text: () => Promise.resolve(""),
      });

    it.send().click();
    await it.settle(120);
    expect(it.note()).toBe(
      "Cardmarket is checking the browser; reload and try again"
    );
    expect(it.noteShown()).toBe(true);
  });

  test("what a read has to say about itself goes on the hover", async () => {
    // Three of the fixture's fourteen rows name no product, and no rates
    // were reachable, so this read has something to report. It is a
    // footnote to the count rather than a thing to act on, and the panel
    // is too small to carry a line that is read once and ignored after.
    const it = mount();
    expect(it.noteShown()).toBe(false);
    it.send().click();
    await it.settle();
    expect(it.scope()).toBe("11 rows");
    expect(it.tip()).toBe("3 skipped, 1 non-English, 11 unpriced");
    // The line under the buttons stays shut. It is for the things that
    // ask for something - a refused read, a blocked pop-up.
    expect(it.noteShown()).toBe(false);
  });

  test("and saving marks the count rather than announcing it", async () => {
    const it = mount();
    expect(it.markShown()).toBe(false);
    it.save().click();
    await it.settle();

    expect(it.markShown()).toBe(true);
    expect(it.scope()).toBe("11 rows");
    expect(it.tip()).toBe("saved, 3 skipped, 1 non-English, 11 unpriced");
    expect(it.noteShown()).toBe(false);
    expect(it.heading()).toBe("CM BANner - 11 rows\u2713");
  });

  test("and the hover over it says the results and nothing else", async () => {
    const it = mount();
    expect(it.tip()).toBe("14 offers listed - click for this page");

    it.save().click();
    await it.settle();

    expect(it.tip()).toBe("saved, 3 skipped, 1 non-English, 11 unpriced");

    // And the heading gets its own back when the rows are dropped.
    it.toggleScope();
    expect(it.tip()).toBe("14 offers on this page - click for the whole list");
  });

  test("the tooltip is the panel's own, and the only one", async () => {
    // A title is shown by the browser a second or so after the cursor
    // stops, and would come up on top of the panel's own tooltip.
    const it = mount();
    expect(it.titled()).toBe(0);
    expect(it.label().getAttribute("aria-describedby")).toBe("cm-banner-tip");
    it.save().click();
    await it.settle();
    expect(it.titled()).toBe(0);
    expect(mount({ loggedOut: true }).titled()).toBe(0);
  });

  test("the mark goes when the rows it stood for do", async () => {
    const it = mount();
    it.save().click();
    await it.settle();
    expect(it.markShown()).toBe(true);

    it.toggleScope();
    expect(it.markShown()).toBe(false);
    expect(it.tip()).not.toContain("saved");
  });

  test("and the second click hands them over", async () => {
    const it = mount();
    it.send().click();
    await it.settle();
    it.send().click();
    expect(it.opened[0]).toBe("https://mtgban.com/upload/handoff");
  });

  test("the rows say which page they were read from", async () => {
    // Without it the site can only call them pasted text, which is all a
    // form post looks like by the time it arrives there.
    const it = mount();
    it.send().click();
    await it.settle();
    it.send().click();
    it.ready();
    // The rows go over when both halves are in hand, which is a tick away
    // when the page answers before the promise holding them resolves.
    await it.settle();
    const handed = it.opened.find((o) => o && o.data && o.data.csv);
    expect(handed.data.source).toBe(OFFERS);
    expect(handed.data.rows).toBe(11);
  });

  test("rows in hand are dropped when the same-sized table changes under them", async () => {
    // Filtering to a different twenty offers, or sorting the same twenty,
    // leaves the count where it was and every row in hand describing
    // something else.
    const it = mount();
    it.send().click();
    await it.settle();
    expect(it.send().textContent).toBe("READY");

    const rows = [...it.window.document.querySelectorAll('[id^="stockRow"]')];
    const first = rows[0];
    first.parentNode.insertBefore(rows[rows.length - 1], first);

    await it.settle(400);
    expect(it.send().textContent).toBe("Send to BAN");
  });

  test("rows in hand are dropped when the scope changes", async () => {
    const it = mount();
    it.send().click();
    await it.settle();
    expect(it.send().textContent).toBe("READY");
    it.toggleScope();
    expect(it.send().textContent).toBe("Send to BAN");
    expect(it.armed()).toBe(false);
    // And the heading stops claiming rows nobody is asking for now.
    expect(it.scope()).toBe("this page only");
  });
});

describe("Escape", () => {
  test("it stops a read and puts the panel back", async () => {
    const it = mount({ pager: "pager-next.html", total: 1093 });
    it.send().click();
    expect(it.busy()).toBe(true);
    it.escape();
    expect(it.busy()).toBe(false);
    expect(it.send().disabled).toBe(false);
    expect(it.note()).toBe("");
    await it.settle();
    // The read that was abandoned comes back later and says nothing.
    expect(it.send().textContent).toBe("Send to BAN");
    expect(it.busy()).toBe(false);
  });

  test("it is inert when there is nothing of ours to stop", () => {
    const it = mount();
    it.escape();
    expect(it.busy()).toBe(false);
    expect(it.heading()).toBe("CM BANner - all offers");
  });
});

describe("signed out", () => {
  test("the whole list is not on offer", () => {
    // Cardmarket answers a visitor it has not signed in with page one and
    // then a page holding no rows. A link leading to nothing is where a
    // pager stops, so a walk would finish without ever knowing it had
    // been cut off, and hand back page one shaped like an inventory.
    const it = mount({ loggedOut: true });

    expect(it.locked()).toBe(true);
    expect(it.scope()).toBe("this page only");
    expect(it.tip()).toBe(
      "Sign in to Cardmarket to read the whole list - it shows a visitor this page and no more"
    );
  });

  test("and says so on the hover alone", async () => {
    // The line under the buttons is for what just happened; this is the
    // state the panel is in, and the heading's hover already says it.
    const it = mount({ loggedOut: true });
    expect(it.noteShown()).toBe(false);

    it.save().click();
    await it.settle();
    expect(it.note()).not.toContain("Sign in");
  });

  test("and the heading stops being a control", () => {
    const it = mount({ loggedOut: true });
    it.toggleScope();
    expect(it.scope()).toBe("this page only");
    it.toggleScope();
    expect(it.scope()).toBe("this page only");
  });

  test("while a signed-in page opens on the whole list as before", () => {
    const it = mount();
    expect(it.locked()).toBe(false);
    expect(it.scope()).toBe("all offers");
  });
});

describe("a walk that ended before the pages did", () => {
  // What a signed-out visitor is served past page one, and what anything
  // else serving an empty page would look like: the pager leads to a page
  // with no rows on it, which is where a walk stops. Nothing says so.
  const emptyPage = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve("<html><body><div>nothing here</div></body></html>"),
    });

  test("is refused rather than written out short", async () => {
    const it = mount({ pager: "pager-next.html", total: 1093 });
    it.window.fetch = emptyPage;

    it.save().click();
    // The walk waits PACE before asking for page two, which is the one
    // place in the suite where that wait is not worth mocking away: what
    // is being tested is what comes back from it.
    await it.settle(1500);

    // One page of fourteen against the 1093 the page itself advertises.
    expect(it.note()).toBe(
      "Only 14 of 1093 offers came back, so nothing was saved"
    );
    expect(it.noteShown()).toBe(true);
    expect(it.markShown()).toBe(true);
    expect(it.mark()).toBe("✗");
    expect(it.markFailed()).toBe(true);
    // And nothing was armed, so the send button cannot spend it either.
    expect(it.send().textContent).toBe("Send to BAN");
  });

  test("while a page short of one offer still writes the file", async () => {
    // An offer sold mid-walk shifts the rest up a place and one falls
    // between two fetches. That is a footnote, not a failure, and telling
    // the two apart is the whole point of measuring in pages.
    const it = mount({ pager: "pager-last.html", total: 15 });

    it.save().click();
    await it.settle(120);

    expect(it.markShown()).toBe(true);
    expect(it.mark()).toBe("✓");
    expect(it.markFailed()).toBe(false);
    expect(it.tip()).toContain("15 were listed");
  });
});

describe("a handoff the tab has not answered", () => {
  test("keeps the rows, and the pulse, in hand", async () => {
    // The second click is the retry: nothing about the rows went wrong,
    // and walking the seller again would cost minutes.
    const it = mount();
    it.send().click();
    await it.settle();

    it.send().click();
    await it.settle();

    expect(it.send().textContent).toBe("READY");
    expect(it.armed()).toBe(true);
  });

  test("and one the tab answers spends them", async () => {
    const it = mount();
    it.send().click();
    await it.settle();

    it.send().click();
    it.ready();
    await it.settle();

    expect(it.send().textContent).toBe("Send to BAN");
    expect(it.armed()).toBe(false);
  });
});
