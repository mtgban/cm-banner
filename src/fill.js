// Hands the upload page a file, as though one had been picked from disk.
//
// The rows are not posted across origins. The upload needs the session, the
// site's cookie is same-site, and a request made from cardmarket.com would
// arrive without it and be refused. So the page is left to do its own
// upload, from its own origin, with its own session. What is done here is
// putting the file in the picker and pressing the page's own button.
//
// A file rather than the textarea, because the page's file input carries an
// onchange that wires the rest of its state: it names the file on screen,
// clears the other sources, and enables the submit buttons, which start
// disabled. Filling the textarea instead sets a value the page never hears
// about, and leaves Upload greyed out. An inline handler runs on an event
// dispatched from here, so pressing the picker's own path is enough.
//
// The page's own Upload button is then pressed. It carries an onclick that
// does the submitting - it clears the hidden mode flags, points the form at
// this tab and submits it - so the button is clicked rather than the form
// submitted directly, and the page uploads exactly as it would by hand.

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

  // asFile puts the rows in the page's own file picker. Assigning to files
  // also sets the input's value, which is what its handler reads to name the
  // file on screen.
  function asFile(csv, filename) {
    var input =
      document.querySelector('input[type="file"][name="cardListFile"]') ||
      document.querySelector('input[type="file"]');
    if (!input || typeof DataTransfer === "undefined") {
      return false;
    }
    try {
      var carrier = new DataTransfer();
      carrier.items.add(new File([csv], filename, { type: "text/csv" }));
      input.files = carrier.files;
    } catch (err) {
      return false;
    }
    if (input.files.length === 0) {
      return false;
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.scrollIntoView({ block: "center" });
    return true;
  }

  // asText is the fallback for a page with no picker. It sets a value the
  // page may not hear about, so it is second and is said out loud.
  function asText(csv) {
    var area =
      document.querySelector('textarea[name="textArea"]') ||
      document.querySelector("textarea");
    if (!area) {
      return false;
    }
    area.value = csv;
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.dispatchEvent(new Event("change", { bubbles: true }));
    area.scrollIntoView({ block: "center" });
    return true;
  }

  // submit presses the page's own Upload button. It starts disabled and is
  // enabled by the file input's own handler, so a button still disabled here
  // means the rows did not land where the page could see them.
  function submit() {
    var button = document.getElementById("submit_default");
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  // The rows are taken once. A second message, however it arrives, is not a
  // second upload.
  var taken = false;

  window.addEventListener("message", function (event) {
    // Three things have to hold: the right site said it, the window this one
    // was opened by said it, and it is the message this is waiting for.
    // Anything else on the page's message channel is not ours.
    if (
      taken ||
      event.origin !== SENDER ||
      event.source !== opener ||
      !event.data ||
      event.data.type !== ROWS ||
      typeof event.data.csv !== "string"
    ) {
      return;
    }

    taken = true;
    var rows = event.data.csv.trim().split("\n").length - 1;
    var filename = event.data.name || "cardmarket.csv";

    if (asFile(event.data.csv, filename)) {
      if (submit()) {
        banner("Uploading " + rows + " rows from Cardmarket…");
        return;
      }
      // The file is in the picker and the page can see it, but its own
      // button is not ready; leaving it to be pressed by hand beats
      // pretending nothing happened.
      banner(rows + " rows from Cardmarket — press Upload when ready");
      return;
    }
    if (asText(event.data.csv)) {
      banner(
        rows +
          " rows pasted from Cardmarket — pick the text tab, then press Upload"
      );
      return;
    }
    banner("Could not find anywhere to put the rows on this page");
  });

  // Said last, once this is listening: the other half waits to be told.
  opener.postMessage({ type: READY }, SENDER);
})();
