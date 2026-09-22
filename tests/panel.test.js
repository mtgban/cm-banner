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
    // The button becomes the second click, and the heading has its word
    // back.
    expect(it.send().textContent).toBe("Send 11 rows");
    expect(it.scope()).toBe("all offers");
    expect(it.busy()).toBe(false);
    expect(it.send().disabled).toBe(false);
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

  test("rows in hand are dropped when the scope changes", async () => {
    const it = mount();
    it.send().click();
    await it.settle();
    expect(it.send().textContent).toBe("Send 11 rows");
    it.toggleScope();
    expect(it.send().textContent).toBe("Send to BAN");
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
