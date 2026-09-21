// Fills the upload page with the CSV the Cardmarket page just made.
//
// This is the half that makes "send to BAN" work without a cross-origin
// request. The site sends no CORS headers and its session cookie is
// same-site, so a POST from cardmarket.com would arrive unauthenticated and
// be refused. Here the person is already signed in, on their own tab, and
// the CSV only has to reach the textarea the form already has.
//
// Nothing is submitted. The rows are put in front of the person with the
// page's own Upload button left for them to press, because sending someone
// else's cards to a valuation is their decision and not this script's.

(function () {
  "use strict";

  var HANDOFF = "cm-banner-handoff";
  // A handoff older than this is from some earlier visit, not the click that
  // opened this tab, and filling the form from it would be a surprise.
  var FRESH_MS = 2 * 60 * 1000;

  var api = globalThis.browser || globalThis.chrome;
  if (!api || !api.storage || !api.storage.local) {
    return;
  }

  function banner(message) {
    var note = document.createElement("div");
    note.id = "cm-banner-filled";
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(function () {
      note.remove();
    }, 8000);
  }

  function fill(csv) {
    var area =
      document.querySelector('textarea[name="textArea"]') ||
      document.querySelector("textarea");
    if (!area) {
      return false;
    }
    area.value = csv;
    // The page may be watching its own field.
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.dispatchEvent(new Event("change", { bubbles: true }));
    area.scrollIntoView({ block: "center" });
    area.focus();
    return true;
  }

  api.storage.local.get(HANDOFF, function (stored) {
    var handoff = stored && stored[HANDOFF];
    if (!handoff || !handoff.csv) {
      return;
    }
    // Taken once: a reload should not refill a form the person has since
    // edited or already sent.
    api.storage.local.remove(HANDOFF);

    if (Date.now() - (handoff.at || 0) > FRESH_MS) {
      return;
    }
    if (!fill(handoff.csv)) {
      return;
    }

    var rows = handoff.csv.trim().split("\n").length - 1;
    banner(rows + " rows from Cardmarket — press Upload when ready");
  });
})();
