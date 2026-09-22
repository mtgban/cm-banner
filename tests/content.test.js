import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";

// content.js is the one file the suite cannot load: it installs a panel into
// a live Cardmarket page on sight. What it can do is hold the orderings that
// the handoff depends on, all of which are invisible until they break and
// none of which a reader would think to preserve.
const content = readFileSync(
  new URL("../src/content.js", import.meta.url),
  "utf8"
);

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
