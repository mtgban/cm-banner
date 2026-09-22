// Loads the content scripts the way the browser does - plain scripts sharing
// one global - and gives them a DOM to read.

import { Window } from "happy-dom";
import { readFileSync } from "fs";

function source(name) {
  return readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
}

// The scripts attach to globalThis.MKM, so they are run once, here.
globalThis.MKM = globalThis.MKM || {};
for (const name of ["rates.js", "parse.js", "pages.js", "csv.js"]) {
  new Function("globalThis", source(name))(globalThis);
}

// load reads a fixture into a document the parser can walk.
export function load(name) {
  const html = readFileSync(
    new URL("./fixtures/" + name, import.meta.url),
    "utf8"
  );
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document;
}

export function parse(doc) {
  return globalThis.MKM.parseOffers(doc);
}

export const MKM = globalThis.MKM;

// text reads a fixture as it sits on disk.
export function text(name) {
  return readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
}

// pageOf builds one page of a seller's list: the offers fixture's rows with
// their article ids moved along, so two pages can be told apart, under a
// pager copied from a real response.
//
// The pager fixtures are verbatim; the next-page href and the hit count are
// substituted, because those are the two things a test needs to vary and
// the only two Cardmarket varies between one page and the next.
export function pageOf({ offset = 0, next = "", total = 0, pager = "" } = {}) {
  const rows = text("offers.html").replace(
    /stockRow(\d+)/g,
    (_, id) => "stockRow" + (Number(id) + offset)
  );
  let markup = text(pager || (next ? "pager-next.html" : "pager-last.html"));
  if (next) {
    markup = markup.replace("/en/Magic/Users/Seller/Offers/Singles?site=3", next);
  }
  if (total) {
    markup = markup.replace(">1093<", ">" + total + "<");
  }
  const window = new Window();
  window.document.body.innerHTML = markup + rows;
  return window.document;
}
