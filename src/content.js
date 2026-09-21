// Puts an export control on a Cardmarket page that lists offers.
//
// Nothing here touches an extension API. The parse is a DOM read, the file is
// handed over with a blob and an anchor, and both are plain web platform, so
// the same build runs unchanged on Chrome, Firefox and Safari and the
// manifest asks for no permission beyond being on the page at all.

(function (MKM) {
  "use strict";

  var PANEL_ID = "cm-banner";
  // Cardmarket's own id for English, as its product links spell it.
  var ENGLISH = "1";

  // The page path names the game: /<language>/<Game>/... for every game
  // Cardmarket sells.
  function gameFromPath(pathname) {
    var parts = pathname.split("/");
    return parts.length > 2 && parts[2] ? parts[2].toLowerCase() : "cardmarket";
  }

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function download(text, filename) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Firefox needs the object to outlive the click it was created for.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  function say(panel, message) {
    var note = panel.querySelector(".cm-banner-note");
    if (note) {
      note.textContent = message;
    }
  }

  // languageWanted is the filter the parser is handed: English alone, or
  // every language the page lists.
  //
  // It defaults to English because the CSV has no language column and the
  // upload matches what it is given as English: a German printing exported
  // unmarked is priced as the English one. Turning it off is the deliberate
  // act, and the panel says how many rows it cost.
  function languageWanted(panel) {
    var box = panel.querySelector(".cm-banner-english");
    return box && box.checked ? ENGLISH : "";
  }

  function exportOffers(panel) {
    var offers = MKM.parseOffers(document, languageWanted(panel));
    var total = MKM.countRows(document);

    if (offers.length === 0) {
      // Told apart deliberately: a page with rows that all refused is not a
      // page with no rows, and only one of the two is worth reporting.
      say(
        panel,
        total === 0
          ? "No offers on this page"
          : "None of the " + total + " offers here could be read"
      );
      return;
    }

    download(
      MKM.toCSV(offers),
      "mkm-" + gameFromPath(location.pathname) + "-" + today() + ".csv"
    );

    var skipped = total - offers.length;
    say(
      panel,
      skipped > 0
        ? offers.length + " exported, " + skipped + " skipped"
        : offers.length + " exported"
    );
  }

  // shown is the row count the panel last named, so a change in the page can
  // be told from the page merely being touched.
  var shown = -1;

  function label(panel) {
    var count = MKM.countRows(document);
    var text = panel.querySelector(".cm-banner-label");
    if (text) {
      text.textContent = "Export " + count + " to BAN";
    }
    panel.hidden = count === 0;
    shown = count;
    return count;
  }

  function build() {
    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<button type="button" class="cm-banner-button">' +
      '<span class="cm-banner-label"></span>' +
      '<span class="cm-banner-note"></span>' +
      "</button>" +
      '<label class="cm-banner-lang">' +
      '<input type="checkbox" class="cm-banner-english" checked>' +
      "<span>English only</span>" +
      "</label>";

    panel
      .querySelector(".cm-banner-button")
      .addEventListener("click", function () {
        exportOffers(panel);
      });
    // Changing the filter does not re-export, and what the last export said
    // was said about the other filter.
    panel
      .querySelector(".cm-banner-english")
      .addEventListener("change", function () {
        say(panel, "");
      });
    return panel;
  }

  function install() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    var panel = build();
    document.body.appendChild(panel);
    label(panel);

    // The page fills its table after load and refills it on every filter, so
    // the count follows the table rather than the moment this ran.
    //
    // Only a changed count counts as a change. Exporting appends an anchor to
    // the document and takes it away again, which is a mutation like any
    // other: reacting to every one of those cleared the line saying what the
    // export had just done, about a third of a second after it said it.
    var pending = null;
    var observer = new MutationObserver(function () {
      if (pending !== null) {
        return;
      }
      pending = setTimeout(function () {
        pending = null;
        if (MKM.countRows(document) === shown) {
          return;
        }
        // The table itself moved, so what the last export said of it no
        // longer holds.
        say(panel, "");
        label(panel);
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})(globalThis.MKM);
