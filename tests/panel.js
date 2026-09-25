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

export function mount({
  pager = "pager-last.html",
  url = OFFERS,
  total = 14,
  loggedOut = false,
} = {}) {
  const window = new Window({ url });
  // Cardmarket puts a login form on every page it serves to somebody it
  // has not signed in. The rest of the page is the same.
  window.document.body.innerHTML =
    (loggedOut ? '<form id="header-login"></form>' : "") +
    fixture(pager).replace(">1093<", ">" + total + "<") +
    fixture("offers.html");

  // Everything that leaves the page is recorded instead of happening.
  const opened = [];
  window.open = function (href) {
    opened.push(href);
    opened.source = {
      closed: false,
      postMessage: function (data, origin) {
        opened.push({ data: data, origin: origin });
      },
      close: function () {
        opened.push("closed");
      },
    };
    return opened.source;
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
    // What the heading says out loud. textContent would include the tick
    // whether or not it is on screen, which is the one thing about the
    // heading worth telling apart.
    heading: () =>
      [...at(".cm-banner-label").childNodes]
        .filter((node) => !node.hidden)
        .map((node) => node.textContent)
        .join(""),
    scope: () => at(".cm-banner-scope").textContent,
    label: () => at(".cm-banner-label"),
    send: () => at(".cm-banner-send"),
    save: () => at(".cm-banner-save"),
    note: () => at(".cm-banner-note").textContent,
    markShown: () => !at(".cm-banner-mark").hidden,
    mark: () => at(".cm-banner-mark").textContent,
    markFailed: () =>
      at(".cm-banner-mark").classList.contains("cm-banner-failed"),
    // The heading's tooltip: what clicking it does, or what the last read
    // had to say about itself while that is up.
    tip: () => at(".cm-banner-tip").textContent,
    // Anything still wearing a title, which the browser would draw a second
    // later on top of the panel's own.
    titled: () => panel.querySelectorAll("[title]").length,
    noteShown: () => !at(".cm-banner-note").hidden,
    busy: () => panel.classList.contains("cm-banner-busy"),
    armed: () => panel.classList.contains("cm-banner-armed"),
    locked: () => panel.classList.contains("cm-banner-locked"),
    toggleScope: () => at(".cm-banner-label").click(),
    escape: () =>
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape" })
      ),
    // Answers the way the site's handoff page does once it has loaded.
    ready: () =>
      window.dispatchEvent(
        Object.assign(new window.Event("message"), {
          source: opened.source,
          origin: "https://mtgban.com",
          data: { type: "mtgban-handoff-ready" },
        })
      ),
    settle: (ms = 50) => new Promise((done) => setTimeout(done, ms)),
  };
}

export { OFFERS };
