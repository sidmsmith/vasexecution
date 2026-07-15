/** Shared image/diagram gallery modal for VAS Execution + admin preview. */
(function (global) {
  let gallery = [];
  let index = 0;

  function els() {
    return {
      modal: document.getElementById("diagramModal"),
      title: document.getElementById("diagramModalLabel"),
      img: document.getElementById("diagramModalImg"),
      caption: document.getElementById("diagramModalCaption"),
      prev: document.getElementById("diagramModalPrev"),
      next: document.getElementById("diagramModalNext")
    };
  }

  function render() {
    const ui = els();
    if (!ui.modal || !ui.img || !gallery.length) return;
    const item = gallery[index] || { url: "", caption: "" };
    const caption = String(item.caption || "").trim();

    ui.img.src = item.url || "";
    ui.img.alt = caption;

    // Title = configurable image caption only; hide when blank (never "Diagram")
    if (ui.title) {
      ui.title.textContent = caption;
      ui.title.hidden = !caption;
      ui.title.style.display = caption ? "" : "none";
    }
    if (ui.caption) {
      ui.caption.textContent = "";
      ui.caption.hidden = true;
      ui.caption.style.display = "none";
    }

    if (ui.prev) {
      ui.prev.hidden = index <= 0;
      ui.prev.style.display = index <= 0 ? "none" : "";
    }
    if (ui.next) {
      ui.next.hidden = index >= gallery.length - 1;
      ui.next.style.display = index >= gallery.length - 1 ? "none" : "";
    }
  }

  function showModal() {
    const ui = els();
    if (!ui.modal || !global.bootstrap) return;
    render();
    bootstrap.Modal.getOrCreateInstance(ui.modal).show();
  }

  function openFromButton(btn) {
    if (!btn) return;
    const scope =
      btn.closest(".vas-content-list") ||
      btn.closest(".vas-config-block") ||
      btn.parentElement;
    const buttons = scope
      ? Array.from(scope.querySelectorAll(".vas-content-image-btn"))
      : [btn];
    gallery = buttons
      .map((b) => ({
        url: b.dataset.imageUrl || "",
        caption: b.dataset.imageCaption || ""
      }))
      .filter((x) => x.url);
    if (!gallery.length) return;
    const clickedUrl = btn.dataset.imageUrl || "";
    index = Math.max(
      0,
      gallery.findIndex((g) => g.url === clickedUrl)
    );
    if (index < 0) index = 0;
    showModal();
  }

  function step(delta) {
    const next = index + delta;
    if (next < 0 || next >= gallery.length) return;
    index = next;
    render();
  }

  function wireControls() {
    const ui = els();
    if (!ui.modal || ui.modal.dataset.galleryBound) return;
    ui.modal.dataset.galleryBound = "1";
    if (ui.prev) ui.prev.onclick = () => step(-1);
    if (ui.next) ui.next.onclick = () => step(1);
    ui.modal.addEventListener("hidden.bs.modal", () => {
      if (ui.img) ui.img.removeAttribute("src");
      gallery = [];
      index = 0;
    });
  }

  function bindTriggers(root) {
    wireControls();
    if (!root) return;
    root.querySelectorAll(".vas-content-image-btn").forEach((btn) => {
      btn.title = "Open";
      btn.onclick = () => openFromButton(btn);
    });
  }

  global.VasImageModal = {
    openFromButton,
    bindTriggers,
    wireControls
  };
})(typeof window !== "undefined" ? window : globalThis);
