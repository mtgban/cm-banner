// Fills the upload form with the rows the Cardmarket tab just read.
//
// This is the half that makes "send to BAN" work without a cross-origin
// request. The upload needs the session, the site's cookie is same-site, and
// a request made from cardmarket.com would arrive without it and be refused.
// Here the person is already signed in, on their own tab, and the rows only
// have to reach the textarea the form already has.
//
// Nothing is stored and no permission is asked for: the Cardmarket tab opened
// this one, so the two windows can speak directly.
//
// Nothing is submitted either. The rows are put in front of the person with
// the page's own Upload button left for them to press, because sending a
// collection off to be valued is their decision and not this script's.

(function () {
  "use strict";

  var READY = "cm-banner-ready";
  var ROWS = "cm-banner-rows";
  // The only page allowed to hand rows over.
  var SENDER = "https://www.cardmarket.com";

  var opener = window.opener;
  if (!opener) {
    // Opened by hand rather than by the other half: nothing to wait for.
    return;
  }

  function banner(message) {
    var note = document.getElementById("cm-banner-filled");
    if (!note) {
      note = document.createElement("div");
      note.id = "cm-banner-filled";
      document.body.appendChild(note);
    }
    note.textContent = message;
    setTimeout(function () {
      note.remove();
    }, 10000);
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

  window.addEventListener("message", function (event) {
    // Three things have to hold: the right site said it, the window this one
    // was opened by said it, and it is the message this is waiting for.
    // Anything else on the page's message channel is not ours.
    if (
      event.origin !== SENDER ||
      event.source !== opener ||
      !event.data ||
      event.data.type !== ROWS ||
      typeof event.data.csv !== "string"
    ) {
      return;
    }

    if (!fill(event.data.csv)) {
      banner("Could not find the upload box on this page");
      return;
    }
    var rows = event.data.csv.trim().split("\n").length - 1;
    banner(rows + " rows from Cardmarket — press Upload when ready");
  });

  // Said last, once this is listening: the other half waits to be told.
  opener.postMessage({ type: READY }, SENDER);
})();
