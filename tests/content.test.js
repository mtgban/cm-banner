import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";

// Orderings that are cheaper to assert in the source than to provoke: the
// difference between opening a window before a read and after it is not
// visible in the result, only in whether a browser allowed it.
//
// Anything the panel actually does belongs in panel.test.js, which runs
// this file rather than reading it. These tests cannot tell whether the
// code works - one of them went on passing while the button did nothing
// at all - only whether it still says what it should.
const content = readFileSync(
  new URL("../src/content.js", import.meta.url),
  "utf8"
);
const css = readFileSync(new URL("../src/content.css", import.meta.url), "utf8");

// Top-level functions inside the IIFE are indented two spaces; the ones
// nested inside them are indented four, so they are not mistaken for the
// start of the next.
function body(name) {
  const at = content.indexOf("function " + name + "(");
  expect(at).toBeGreaterThan(-1);
  const next = content.indexOf("\n  function ", at + 1);
  return content.slice(at, next === -1 ? content.length : next);
}

describe("handing the rows over", () => {
  test("nothing slow stands between the click and the window", () => {
    // window.open needs the click's transient activation, which Firefox
    // keeps alive about five seconds and then calls the result a pop-up,
    // blocks it, and puts a bar across the top of the page. So the open
    // is the first thing the function does.
    const handOff = body("handOff");
    expect(handOff).toContain("window.open(");
    expect(handOff.indexOf("window.open(")).toBeLessThan(handOff.indexOf(".then("));
    for (const slow of ["collect(", "walkPages", "fetchRates", "await "]) {
      expect(handOff).not.toContain(slow);
    }
  });

  test("one page goes in a single click", () => {
    // A DOM read and one rates fetch sit comfortably inside the few
    // seconds a click stays live, so the tab opens on that click and the
    // rows follow it.
    const sendToBan = body("sendToBan");
    const branch = sendToBan.slice(sendToBan.indexOf("if (hereOnly())"));
    expect(branch.slice(0, branch.indexOf("\n    }"))).toContain("handOff(");
  });

  test("the whole list is read first and handed over by a second click", () => {
    // Thirteen pages already outlives the click and a hundred takes
    // minutes, so this path arms the button instead of opening anything.
    const sendToBan = body("sendToBan");
    const tail = sendToBan.slice(sendToBan.lastIndexOf("read(panel)"));
    expect(tail).toContain("arm(panel,");
    expect(tail).not.toContain("handOff(");
  });

  test("rows already in hand skip straight to the window", () => {
    const sendToBan = body("sendToBan");
    expect(sendToBan.indexOf("if (armed)")).toBeLessThan(
      sendToBan.indexOf("if (hereOnly())")
    );
  });

  test("it listens before the tab it opened can have loaded", () => {
    // The handoff page says it is listening once, as it loads, and never
    // repeats it. Loading cannot finish while this function is still
    // running, so the listener is in time as long as it goes up in the
    // body itself - not inside the callback waiting on the rows, which
    // is the version of this that would hang.
    const handOff = body("handOff");
    expect(handOff).toContain('window.addEventListener("message"');
    expect(handOff.indexOf('window.addEventListener("message"')).toBeLessThan(
      handOff.indexOf("rows.then(")
    );
  });
});

describe("rows in hand", () => {
  test("they are dropped when the table moves underneath them", () => {
    // The observer is what notices Cardmarket refilling its own table.
    // Rows read before that no longer describe what is on offer.
    const install = body("install");
    expect(install).toContain("MutationObserver");
    expect(install).toContain("disarm(panel)");
  });

  test("they are dropped when the scope changes", () => {
    // Rows read for the whole list are not the rows being asked for once
    // the heading says this page, and the other way round.
    const build = body("build");
    expect(build).toContain("scope = (scope + 1)");
    expect(build).toContain("disarm(panel)");
  });

  test("they are spent only once they have landed", () => {
    // A tab that never answered is worth another click, not another
    // hundred pages.
    const handOff = body("handOff");
    expect(handOff.indexOf("postMessage")).toBeLessThan(
      handOff.indexOf("disarm(panel)")
    );
  });
});

describe("staying put while it reads", () => {
  test("the page asks before it goes anywhere", () => {
    // A read lives in this page: a link, the back button or a reload
    // takes the content script with it, and a hundred pages of reading
    // goes silently with it.
    const busy = body("busy");
    expect(busy).toContain('addEventListener("beforeunload", hold)');
    expect(busy).toContain('removeEventListener("beforeunload", hold)');
  });

  test("and only while it reads", () => {
    // A beforeunload listener left attached keeps the page out of the
    // browser's back/forward cache for as long as the tab lives, which
    // would be this extension slowing down every Cardmarket page.
    for (const name of ["install", "build", "handOff", "sendToBan"]) {
      expect(body(name)).not.toContain("beforeunload");
    }
  });
});

describe("stopping", () => {
  test("Escape puts the panel back and drops the rows", () => {
    // A read stopped part way is not a shorter export. Keeping its rows
    // would be offering a fraction of a collection as the collection.
    const stop = body("stopReading");
    expect(stop).toContain("generation++");
    expect(stop).toContain("busy(panel, false)");
    expect(stop).toContain("disarm(panel)");
  });

  test("it is inert unless there is something of ours to stop", () => {
    // Cardmarket uses the key too, and a panel in the corner of someone
    // else's page does not get to swallow it.
    const install = body("install");
    const handler = install.slice(install.indexOf('event.key !== "Escape"'));
    expect(handler).toContain("cm-banner-busy");
    expect(handler).toContain("armed");
    expect(handler).not.toContain("preventDefault");
  });

  test("a read that was abandoned cannot turn the spinner off later", () => {
    // The stopped read resolves after the next one has started, and
    // busy(false) from the old one would strand the new one.
    const read = body("read");
    expect(read).toContain("mine !== generation");
    expect(read.indexOf("stale()")).toBeLessThan(read.indexOf("busy(panel, false)"));
  });
});

describe("the panel does not move", () => {
  // It is anchored to the bottom right corner of somebody else's page and
  // the cursor is on it. Every pixel it grows, in either direction, drags
  // a button out from under that cursor - and it grows while reading,
  // which is exactly when nobody is looking at it.
  test("it has one width rather than a width that fits what it says", () => {
    const at = css.indexOf("#cm-banner {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toMatch(/\n\s*width:/);
  });

  test("the line it speaks on is there whether or not it is speaking", () => {
    const at = css.indexOf("#cm-banner .cm-banner-note {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toMatch(/min-height:/);
    // Hiding an empty note is the same bug by another route: the panel
    // grows upwards, so the line arriving moves the buttons.
    expect(body("say")).not.toContain("hidden");
  });

  test("the spinner fits inside that line", () => {
    // A spinner taller than the text grows the note when it appears,
    // which is the panel changing size on its way into a read.
    const at = css.indexOf("#cm-banner.cm-banner-busy .cm-banner-spin {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("box-sizing: border-box");
  });
});
