import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";

// content.js is the one file the suite cannot load: it installs a panel into
// a live Cardmarket page on sight. What it can do is hold the two orderings
// inside sendToBan, both of which are invisible until they break and neither
// of which a reader would think to preserve.
const content = readFileSync(
  new URL("../src/content.js", import.meta.url),
  "utf8"
);
const sendToBan = content.slice(
  content.indexOf("function sendToBan(panel)"),
  content.indexOf("// shown is the row count")
);

describe("handing the rows over", () => {
  test("the tab is opened by the click, not by the rows arriving", () => {
    // Reading a seller's pages takes seconds, and a hundred of them takes
    // minutes. By then the click that asked for it has expired, and
    // window.open is a pop-up: Firefox blocks it and puts a bar at the top
    // of the page saying so. So the open comes before the reading.
    expect(sendToBan).toContain("window.open(");
    expect(sendToBan.indexOf("window.open(")).toBeLessThan(
      sendToBan.indexOf("withCollected(")
    );
  });

  test("it listens before the tab it opened can have loaded", () => {
    // The handoff page says it is listening once, as it loads, and never
    // repeats it. A listener attached when the rows were finally ready
    // would have missed it and the export would hang.
    expect(sendToBan.indexOf('addEventListener("message"')).toBeLessThan(
      sendToBan.indexOf("withCollected(")
    );
  });

  test("a read that produced nothing takes the tab away again", () => {
    // It was opened on the promise of a list. Left alone it sits on
    // "Waiting for the card list…" for good.
    expect(sendToBan).toContain("opened.close()");
  });
});
