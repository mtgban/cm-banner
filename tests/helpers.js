// Loads the content scripts the way the browser does - plain scripts sharing
// one global - and gives them a DOM to read.

import { Window } from "happy-dom";
import { readFileSync } from "fs";

function source(name) {
  return readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
}

// The scripts attach to globalThis.MKM, so they are run once, here.
globalThis.MKM = globalThis.MKM || {};
for (const name of ["parse.js", "csv.js"]) {
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

export function parse(doc, language) {
  return globalThis.MKM.parseOffers(doc, language);
}

export const MKM = globalThis.MKM;
