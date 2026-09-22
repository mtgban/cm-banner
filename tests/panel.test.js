import { test, expect, describe } from "bun:test";
import { mount, OFFERS } from "./panel.js";

describe("the panel", () => {
  test("it appears on a game BAN prices", () => {
    expect(mount().panel).not.toBeNull();
  });

  test("and not on one it cannot send anywhere", () => {
    // A panel whose main button can only apologise is worse than none.
    const dead = mount({
      url: "https://www.cardmarket.com/en/Digimon/Users/Seller/Offers/Singles",
    });
    expect(dead.panel).toBeNull();
  });

  test("the heading names the scope, and clicking it changes it", () => {
    const it = mount();
    expect(it.heading()).toBe("CM BANNER - all offers");
    expect(it.scope()).toBe("all offers");
    it.toggleScope();
    expect(it.heading()).toBe("CM BANNER - this page only");
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

  test("what is left to say opens a line, and only then", async () => {
    // Three of the fixture's fourteen rows name no product, and no rates
    // were reachable, so this read has something to report. A read with
    // nothing to report leaves the panel as it found it.
    const it = mount();
    expect(it.noteShown()).toBe(false);
    it.send().click();
    await it.settle();
    expect(it.noteShown()).toBe(true);
    expect(it.note()).toBe("3 skipped, 1 non-English, 11 unpriced");
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

  test("rows in hand are dropped when the scope changes", async () => {
    const it = mount();
    it.send().click();
    await it.settle();
    expect(it.send().textContent).toBe("READY");
    it.toggleScope();
    expect(it.send().textContent).toBe("Send to BAN");
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
    expect(it.heading()).toBe("CM BANNER - all offers");
  });
});
