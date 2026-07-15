/**
 * Item image hover preview — larger image on hover (~0.4s delay).
 */
(function () {
  const ITEM_IMAGE_PREVIEW_DELAY_MS = 400;
  const ITEM_IMAGE_PREVIEW_HIDE_GRACE_MS = 150;

  let previewEl = null;
  let previewTimer = null;
  let hideTimer = null;
  let previewAnchor = null;

  function ensurePreviewElement() {
    if (previewEl) return previewEl;
    previewEl = document.createElement("div");
    previewEl.className = "item-image-preview hidden";
    previewEl.setAttribute("role", "tooltip");
    previewEl.innerHTML = '<img class="item-image-preview-img" alt="" />';
    document.body.appendChild(previewEl);

    previewEl.addEventListener("mouseenter", () => {
      cancelHidePreview();
    });

    previewEl.addEventListener("mouseleave", (e) => {
      const related = e.relatedTarget;
      if (related?.closest?.(".item-image-wrap")) return;
      scheduleHidePreview();
    });

    return previewEl;
  }

  function positionPreview(anchor) {
    const el = ensurePreviewElement();
    const img = el.querySelector(".item-image-preview-img");
    const url = anchor.dataset.imageUrl || anchor.querySelector("img")?.src || "";
    if (!url) return;
    img.src = url;
    img.onerror = () => hidePreview();

    el.classList.remove("hidden");
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.right + pad;
    let top = rect.top;

    const elRect = el.getBoundingClientRect();
    if (left + elRect.width > window.innerWidth - pad) {
      left = Math.max(pad, rect.left - elRect.width - pad);
    }
    if (top + elRect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - elRect.height - pad);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function cancelHidePreview() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function hidePreview() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    cancelHidePreview();
    previewAnchor = null;
    if (previewEl) previewEl.classList.add("hidden");
  }

  function scheduleHidePreview() {
    cancelHidePreview();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hidePreview();
    }, ITEM_IMAGE_PREVIEW_HIDE_GRACE_MS);
  }

  function showPreview(anchor) {
    previewAnchor = anchor;
    positionPreview(anchor);
  }

  function schedulePreview(anchor) {
    cancelHidePreview();
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      showPreview(anchor);
    }, ITEM_IMAGE_PREVIEW_DELAY_MS);
  }

  function isMovingToPreview(related) {
    return related && previewEl && !previewEl.classList.contains("hidden") && previewEl.contains(related);
  }

  function bindItemImagePreview(container) {
    if (!container || container.dataset.itemImagePreviewBound) return;
    container.dataset.itemImagePreviewBound = "1";

    container.addEventListener(
      "mouseenter",
      (e) => {
        const wrap = e.target.closest(".item-image-wrap");
        if (!wrap) return;
        schedulePreview(wrap);
      },
      true
    );

    container.addEventListener(
      "mouseleave",
      (e) => {
        const wrap = e.target.closest(".item-image-wrap");
        if (!wrap) return;
        const related = e.relatedTarget;
        if (related && (wrap.contains(related) || isMovingToPreview(related))) return;
        scheduleHidePreview();
      },
      true
    );

    document.addEventListener("scroll", hidePreview, true);
    window.addEventListener("resize", hidePreview);
  }

  window.bindItemImagePreview = bindItemImagePreview;
})();
