// Stands the content script up the way the browser does: one window, one
// page, the scripts in manifest order, evaluated in that window so that
// document and location mean what they mean in a tab.
//
// This is the only place content.js is run rather than read. It exists
// because a rewrite once dropped a variable declaration and every
// source-reading test still passed: the function body went on mentioning
// the name, so nothing noticed it was no longer declared. Clicking the
// button noticed immediately.

import { Window } from "happy-dom";
import { readFileSync } from "fs";

const OFFERS = "https://www.cardmarket.com/en/Magic/Users/Seller/Offers/Singles";

function source(name) {
  return readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
}

function fixture(name) {
  return readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
}

export function mount({ pager = "pager-last.html", url = OFFERS, total = 14 } = {}) {
  const window = new Window({ url });
  window.document.body.innerHTML =
    fixture(pager).replace(">1093<", ">" + total + "<") + fixture("offers.html");

  // Everything that leaves the page is recorded instead of happening.
  const opened = [];
  window.open = function (href) {
    opened.push(href);
    return {
      closed: false,
      postMessage: function (data, origin) {
        opened.push({ data: data, origin: origin });
      },
      close: function () {
        opened.push("closed");
      },
    };
  };
  // No rates and no further pages: a refused feed is a blank price column
  // rather than a refused export, which is its own tested behaviour.
  window.fetch = function () {
    return Promise.reject(new Error("offline"));
  };
  window.URL.createObjectURL = function () {
    return "blob:none";
  };
  window.URL.revokeObjectURL = function () {};

  for (const name of ["rates.js", "parse.js", "pages.js", "csv.js", "content.js"]) {
    window.eval(source(name));
  }

  const panel = window.document.getElementById("cm-banner");
  const at = (selector) => panel && panel.querySelector(selector);

  return {
    window,
    panel,
    opened,
    heading: () => at(".cm-banner-label").textContent,
    scope: () => at(".cm-banner-scope").textContent,
    label: () => at(".cm-banner-label"),
    send: () => at(".cm-banner-send"),
    save: () => at(".cm-banner-save"),
    note: () => at(".cm-banner-note").textContent,
    noteShown: () => !at(".cm-banner-note").hidden,
    busy: () => panel.classList.contains("cm-banner-busy"),
    toggleScope: () => at(".cm-banner-label").click(),
    escape: () =>
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape" })
      ),
    settle: (ms = 50) => new Promise((done) => setTimeout(done, ms)),
  };
}

export { OFFERS };
