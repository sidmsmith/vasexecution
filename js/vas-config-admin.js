(function () {
  const VasConfig = window.VasConfig;
  let token = null;
  let org = null;
  let defaultsDoc = null;
  let draft = null;
  let tab = "types"; // types | items
  let selectedKey = null;
  let selectedStepId = null;
  /** @type {Set<string>|null} ProvidedServiceStepId set for selected VAS Type from MAWM */
  let wmsStepIds = null;
  /** selectedKey the current wmsStepIds set belongs to */
  let wmsStepsForKey = null;
  let wmsStepsFetchGen = 0;
  let previewThemeScope = null;
  let previewDeviceLogo = null;
  let previewMode = "mobile"; // mobile | desktop

  const themeModalEl = document.getElementById("themeModal");
  const themeModal =
    themeModalEl && window.bootstrap
      ? new bootstrap.Modal(themeModalEl)
      : null;
  const themeList = document.getElementById("themeList");

  const els = {
    orgSection: document.getElementById("orgSection"),
    orgInput: document.getElementById("org"),
    orgBtn: document.getElementById("orgBtn"),
    mainUI: document.getElementById("mainUI"),
    status: document.getElementById("status"),
    entrySelect: document.getElementById("entrySelect"),
    entrySelectLabel: document.getElementById("entrySelectLabel"),
    editor: document.getElementById("editor"),
    edTitle: document.getElementById("edTitle"),
    edDescription: document.getElementById("edDescription"),
    edIconUrlWrap: document.getElementById("edIconUrlWrap"),
    edIconUrl: document.getElementById("edIconUrl"),
    edIconPreview: document.getElementById("edIconPreview"),
    stepPickerWrap: document.getElementById("stepPickerWrap"),
    stepTabs: document.getElementById("stepTabs"),
    removeStepBtn: document.getElementById("removeStepBtn"),
    contentSectionLabel: document.getElementById("contentSectionLabel"),
    contentList: document.getElementById("contentList"),
    columnCountWrap: document.getElementById("columnCountWrap"),
    columnCountSelect: document.getElementById("columnCountSelect"),
    secSig: document.getElementById("secSig"),
    secPhotos: document.getElementById("secPhotos"),
    secMarkup: document.getElementById("secMarkup"),
    previewHost: document.getElementById("previewHost"),
    configTabSelect: document.getElementById("configTabSelect"),
    deleteKeyBtn: document.getElementById("deleteKeyBtn"),
    addEntryBtn: document.getElementById("addEntryBtn"),
    addEntryBtnLabel: document.getElementById("addEntryBtnLabel"),
    previewThemeBtn: document.getElementById("previewThemeBtn"),
    previewDesktopBtn: document.getElementById("previewDesktopBtn"),
    previewMobileBtn: document.getElementById("previewMobileBtn")
  };

  function status(text, type = "info") {
    els.status.textContent = text || "";
    els.status.className = "app-status " + type;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function deleteBtnHtml(extraClass) {
    return `<button type="button" class="btn btn-icon row-action-btn del-btn ${extraClass}" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>`;
  }

  /** HTML for a single editable content row (text or image block). */
  function contentRowHtml(block, idx) {
    if (block.type === "image") {
      const scale = VasConfig.normalizeImageScale(block.scale);
      return `<div class="content-row image-row draggable-item" data-idx="${idx}" data-type="image" data-id="${esc(
        block.id
      )}">
            <span class="grip" aria-label="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <div class="content-fields">
              <div class="text-format-bar image-scale-bar">
                <span class="content-type-badge"><i class="fa-solid fa-image"></i> Image</span>
                <span class="content-type-badge pdf-url-badge${
                  VasConfig.isPdfUrl(block.url) ? "" : " d-none"
                }"><i class="fa-solid fa-file-pdf"></i> PDF</span>
                <label class="img-scale-label">
                  Size
                  <input type="range" class="img-scale" min="0" max="200" step="1" value="${scale}" aria-label="Image size percent" />
                  <span class="img-scale-value">${scale}%</span>
                </label>
              </div>
              <input class="form-control img-url" placeholder="Image or Cloudinary PDF URL" value="${esc(
                block.url
              )}" />
              <input class="form-control img-caption" placeholder="Caption (optional)" value="${esc(
                block.caption || ""
              )}" />
            </div>
            ${deleteBtnHtml("rm-content")}
          </div>`;
    }
    const color =
      VasConfig.sanitizeColor(block.color) || VasConfig.DEFAULT_TEXT_COLOR;
    const fontSize = VasConfig.normalizeFontSize(block.fontSize);
    const marker = VasConfig.normalizeListMarker(block.listMarker);
    return `<div class="content-row instruction-row draggable-item" data-idx="${idx}" data-type="text" data-id="${esc(
      block.id
    )}">
            <span class="grip" aria-label="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <div class="content-fields">
              <div class="text-format-bar">
                <span class="content-type-badge"><i class="fa-solid fa-align-left"></i> Text</span>
                <button type="button" class="fmt-btn fmt-bold${block.bold ? " active" : ""}" aria-label="Bold"><b>B</b></button>
                <button type="button" class="fmt-btn fmt-italic${block.italic ? " active" : ""}" aria-label="Italic"><i>I</i></button>
                <button type="button" class="fmt-btn fmt-underline${block.underline ? " active" : ""}" aria-label="Underline"><u>U</u></button>
                <label class="fmt-color-wrap">
                  <input type="color" class="fmt-color" value="${esc(color)}" aria-label="Text color" />
                </label>
                <label class="fmt-marker-wrap">
                  <select class="form-select form-select-sm fmt-marker" aria-label="List marker">
                    <option value="none" ${marker==="none"?"selected":""}>None</option>
                    <option value="bullet" ${marker==="bullet"?"selected":""}>• Bullet</option>
                    <option value="check" ${marker==="check"?"selected":""}>✓ Check</option>
                    <option value="arrow" ${marker==="arrow"?"selected":""}>→ Arrow</option>
                    <option value="dash" ${marker==="dash"?"selected":""}>– Dash</option>
                    <option value="star" ${marker==="star"?"selected":""}>★ Star</option>
                  </select>
                </label>
                <label class="img-scale-label txt-scale-label">
                  Size
                  <input type="range" class="img-scale txt-scale" min="50" max="150" step="1" value="${fontSize}" aria-label="Text size percent" />
                  <span class="img-scale-value txt-scale-value">${fontSize}%</span>
                </label>
              </div>
              <textarea class="form-control">${esc(block.text)}</textarea>
            </div>
            ${deleteBtnHtml("rm-content")}
          </div>`;
  }

  async function api(action, data = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data)
    });
    const raw = await response.text();
    try {
      return raw ? JSON.parse(raw) : { success: false, error: "Empty response" };
    } catch {
      return { success: false, error: raw.slice(0, 160) || `HTTP ${response.status}` };
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("json")) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function bucket() {
    return tab === "types" ? "vasTypes" : "items";
  }

  function currentEntry() {
    if (!draft || !selectedKey) return null;
    return draft[bucket()][selectedKey] || null;
  }

  function stepKeys(entry) {
    return VasConfig.orderedStepIds(entry);
  }

  /** Keep entry.stepOrder in sync with entry.steps (drops missing ids, appends new ones). */
  function ensureStepOrder(entry) {
    if (!entry) return;
    if (!entry.steps) entry.steps = {};
    entry.stepOrder = VasConfig.normalizeStepOrder(entry.stepOrder, entry.steps);
    return entry.stepOrder;
  }

  /** Content owner currently being edited (step for types, entry for items). */
  function contentOwner() {
    const entry = currentEntry();
    if (!entry) return null;
    if (tab === "items") return entry;
    if (!selectedStepId) return null;
    if (!entry.steps) entry.steps = {};
    if (!entry.steps[selectedStepId]) {
      entry.steps[selectedStepId] = VasConfig.normalizeStepEntry(
        { title: selectedStepId, content: [] },
        selectedStepId
      );
    }
    return entry.steps[selectedStepId];
  }

  function nid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureEntry(key) {
    if (!draft[bucket()][key]) {
      draft[bucket()][key] = VasConfig.normalizeEntry(
        {
          title: key,
          description: key,
          iconUrl:
            bucket() === "vasTypes" ? VasConfig.DEFAULT_TYPE_ICON_URL : "",
          content: [],
          instructions: [],
          images: [],
          steps: {},
          sections: {
            signature: { ...VasConfig.DEFAULT_SECTIONS.signature },
            photos: { ...VasConfig.DEFAULT_SECTIONS.photos },
            markupPad: { ...VasConfig.DEFAULT_SECTIONS.markupPad }
          }
        },
        key
      );
    }
    return draft[bucket()][key];
  }

  /** Parse a single .content-row into a content block; assigns a stable id if missing. */
  function parseContentRow(row) {
    const type = row.dataset.type === "image" ? "image" : "text";
    if (!row.dataset.id) {
      row.dataset.id = nid(type === "image" ? "img" : "ins");
    }
    if (type === "image") {
      return {
        id: row.dataset.id,
        type: "image",
        url: row.querySelector(".img-url")?.value.trim() || "",
        caption: row.querySelector(".img-caption")?.value.trim() || "",
        scale: VasConfig.normalizeImageScale(
          row.querySelector(".img-scale")?.value
        )
      };
    }
    const colorEl = row.querySelector(".fmt-color");
    return {
      id: row.dataset.id,
      type: "text",
      text: row.querySelector("textarea")?.value || "",
      bold: row.querySelector(".fmt-bold")?.classList.contains("active") || false,
      italic: row.querySelector(".fmt-italic")?.classList.contains("active") || false,
      underline:
        row.querySelector(".fmt-underline")?.classList.contains("active") || false,
      color:
        VasConfig.sanitizeColor(colorEl?.value || "") ||
        VasConfig.DEFAULT_TEXT_COLOR,
      fontSize: VasConfig.normalizeFontSize(
        row.querySelector(".txt-scale")?.value
      ),
      listMarker: VasConfig.normalizeListMarker(
        row.querySelector(".fmt-marker")?.value
      )
    };
  }

  /** Column panes (types, multi-column) or a flat row list (items) under #contentList. */
  function readContentFromDom(keepEmpty) {
    const panes = els.contentList.querySelectorAll(".content-column-pane");
    const rows = panes.length
      ? Array.from(panes).flatMap((pane) =>
          Array.from(pane.querySelectorAll(".content-row"))
        )
      : Array.from(els.contentList.querySelectorAll(".content-row"));
    return rows.map(parseContentRow).filter((b) => {
      if (keepEmpty) return true;
      return b.type === "image" ? !!b.url : !!String(b.text || "").trim();
    });
  }

  /** Raw (un-normalized) layout reflecting the current DOM column panes. */
  function readLayoutFromDom() {
    const panes = Array.from(
      els.contentList.querySelectorAll(".content-column-pane")
    );
    if (panes.length) {
      return {
        columns: panes.map((pane, i) => ({
          id: pane.dataset.colId || `col_${i}`,
          width: Number(pane.dataset.colWidth) || 1,
          blockIds: Array.from(pane.querySelectorAll(".content-row")).map(
            (row) => row.dataset.id || ""
          )
        }))
      };
    }
    const ids = Array.from(
      els.contentList.querySelectorAll(".content-row")
    ).map((row) => row.dataset.id || "");
    return { columns: [{ id: "col_0", width: 1, blockIds: ids }] };
  }

  /** Append a newly-added block id to the last layout column (creating layout if absent). */
  function appendBlockToLastColumn(owner, blockId) {
    const content = owner.content || [];
    const priorContent = content.filter((b) => b.id !== blockId);
    const baseLayout = VasConfig.normalizeLayout(owner.layout, priorContent);
    const cols = baseLayout.columns.map((c) => ({
      id: c.id,
      width: c.width,
      blockIds: c.blockIds.slice()
    }));
    if (!cols.length) cols.push({ id: "col_0", width: 1, blockIds: [] });
    cols[cols.length - 1].blockIds.push(blockId);
    owner.layout = VasConfig.normalizeLayout({ columns: cols }, content);
  }

  function syncIconPreview() {
    if (!els.edIconPreview) return;
    const url =
      (els.edIconUrl?.value || "").trim() ||
      VasConfig.DEFAULT_TYPE_ICON_URL;
    els.edIconPreview.hidden = false;
    els.edIconPreview.src = url;
    els.edIconPreview.onerror = () => {
      els.edIconPreview.hidden = true;
    };
  }

  function syncEditorToDraft() {
    const entry = currentEntry();
    if (!entry || els.editor.style.display === "none") return;
    entry.title = els.edTitle.value.trim() || selectedKey;
    entry.description = els.edDescription.value.trim() || entry.title;
    if (tab === "types") {
      entry.iconUrl = VasConfig.normalizeIconUrl(els.edIconUrl?.value || "");
      ensureStepOrder(entry);
      const owner = contentOwner();
      if (owner) {
        owner.content = readContentFromDom(false);
        owner.layout = VasConfig.normalizeLayout(
          readLayoutFromDom(),
          owner.content
        );
        owner.title = selectedStepId;
      }
      // Type-level content is no longer edited here (legacy may still exist on disk).
    } else {
      entry.content = readContentFromDom(false);
      const legacy = VasConfig.contentToLegacy(entry.content);
      entry.instructions = legacy.instructions;
      entry.images = legacy.images;
    }
    entry.sections = {
      signature: {
        enabled: els.secSig.checked,
        required: false,
        label: `${entry.title} Signature`
      },
      photos: {
        enabled: els.secPhotos.checked,
        required: false,
        label: `${entry.title} Photos`
      },
      markupPad: {
        enabled: els.secMarkup.checked,
        required: false,
        label: `${entry.title} Markup`,
        mode: "photo"
      }
    };
  }

  /** After a drag-drop DOM move: re-read content + layout from DOM and re-render. */
  function afterContentDrop() {
    const owner = contentOwner();
    if (!owner) return;
    owner.content = readContentFromDom(true);
    owner.layout = VasConfig.normalizeLayout(
      readLayoutFromDom(),
      owner.content
    );
    if (tab === "items") {
      const entry = currentEntry();
      const legacy = VasConfig.contentToLegacy(
        owner.content.filter((b) =>
          b.type === "image" ? !!b.url : !!String(b.text || "").trim()
        )
      );
      entry.instructions = legacy.instructions;
      entry.images = legacy.images;
      entry.title = els.edTitle.value.trim() || selectedKey;
      entry.description = els.edDescription.value.trim() || entry.title;
    }
    renderEditor();
    renderPreview();
  }

  /** Drag-and-drop reordering of content rows; supports moving between column panes. */
  function bindContentDrag() {
    const listEl = els.contentList;
    if (!listEl) return;
    let dragEl = null;

    function clearDragOver() {
      listEl
        .querySelectorAll(".content-row, .content-column-pane, .content-column-body")
        .forEach((el) => el.classList.remove("drag-over"));
    }

    listEl.querySelectorAll(".content-row").forEach((row) => {
      const grip = row.querySelector(".grip");
      if (grip) {
        grip.draggable = true;
        grip.addEventListener("dragstart", (e) => {
          dragEl = row;
          row.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", row.dataset.id || "");
          e.stopPropagation();
        });
        grip.addEventListener("dragend", () => {
          row.classList.remove("dragging");
          clearDragOver();
          dragEl = null;
        });
      }
      row.addEventListener("dragover", (e) => {
        if (!dragEl) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (row !== dragEl) row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", (e) => {
        if (!row.contains(e.relatedTarget)) row.classList.remove("drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drag-over");
        if (!dragEl || dragEl === row) return;
        row.parentNode.insertBefore(dragEl, row);
        afterContentDrop();
      });
    });

    listEl
      .querySelectorAll(".content-column-pane, .content-column-body")
      .forEach((zone) => {
        zone.addEventListener("dragover", (e) => {
          if (!dragEl) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", (e) => {
          if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
        });
        zone.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.remove("drag-over");
          if (!dragEl) return;
          const body = zone.classList.contains("content-column-body")
            ? zone
            : zone.querySelector(".content-column-body") || zone;
          body.appendChild(dragEl);
          afterContentDrop();
        });
      });
  }

  /**
   * Load ProvidedServiceStepIds from MAWM for the selected VAS Type and recolor tabs.
   * Called when the type is selected and after step create/rename.
   */
  async function refreshWmsStepMatch() {
    if (tab !== "types" || !selectedKey || !org || !token) {
      wmsStepIds = null;
      wmsStepsForKey = null;
      applyStepTabWmsClasses();
      return;
    }
    const typeId = String(selectedKey || "").trim();
    const gen = ++wmsStepsFetchGen;
    wmsStepIds = null;
    wmsStepsForKey = null;
    applyStepTabWmsClasses();
    const res = await api("provided_services", { org, token });
    if (
      gen !== wmsStepsFetchGen ||
      String(selectedKey || "").trim() !== typeId ||
      tab !== "types"
    ) {
      return;
    }
    if (!res.success) {
      wmsStepIds = null;
      wmsStepsForKey = null;
      applyStepTabWmsClasses();
      status(res.error || "Could not load WMS steps for tab colors", "error");
      return;
    }
    const svc = (res.services || []).find(
      (s) => s && String(s.ProvidedServiceId || "").trim() === typeId
    );
    wmsStepIds = new Set(
      (svc && Array.isArray(svc.ProvidedServiceStep)
        ? svc.ProvidedServiceStep
        : []
      )
        .map((s) => s && s.ProvidedServiceStepId)
        .filter(Boolean)
        .map((id) => String(id).trim())
        .filter(Boolean)
    );
    wmsStepsForKey = selectedKey;
    applyStepTabWmsClasses();
  }

  function stepTabWmsClass(stepId) {
    if (wmsStepIds == null || wmsStepsForKey !== selectedKey) {
      return "step-tab-wms-unknown";
    }
    return wmsStepIds.has(String(stepId || "").trim())
      ? "step-tab-wms-ok"
      : "step-tab-wms-missing";
  }

  function applyStepTabWmsClasses() {
    if (!els.stepTabs) return;
    els.stepTabs.querySelectorAll(".step-tab[data-step-id]").forEach((btn) => {
      btn.classList.remove(
        "step-tab-wms-ok",
        "step-tab-wms-missing",
        "step-tab-wms-unknown"
      );
      btn.classList.add(stepTabWmsClass(btn.dataset.stepId));
      btn.removeAttribute("title");
    });
  }

  /** Rename AssignedServiceStepId (map key + stepOrder); refreshes WMS match colors. */
  async function renameStep(oldId) {
    syncEditorToDraft();
    const entry = currentEntry();
    if (!entry || tab !== "types" || !entry.steps || !entry.steps[oldId]) return;
    const raw = prompt(
      "Rename AssignedServiceStepId (must match MAWM ProvidedServiceStepId):",
      oldId
    );
    const newId = String(raw || "").trim();
    if (!newId || newId === oldId) return;
    if (entry.steps[newId]) {
      status(`Step “${newId}” already exists`, "error");
      return;
    }
    const step = entry.steps[oldId];
    if (step.title === oldId) step.title = newId;
    entry.steps[newId] = step;
    delete entry.steps[oldId];
    entry.stepOrder = VasConfig.normalizeStepOrder(
      (entry.stepOrder || []).map((id) => (id === oldId ? newId : id)),
      entry.steps
    );
    if (selectedStepId === oldId) selectedStepId = newId;
    renderEditor();
    renderPreview();
    await refreshWmsStepMatch();
  }

  /** Drag-and-drop reordering of step tabs; rebuilds entry.stepOrder from DOM order on drop. */
  function bindStepTabDrag() {
    const container = els.stepTabs;
    if (!container) return;
    let dragEl = null;

    const tabsEls = Array.from(
      container.querySelectorAll(".step-tab[data-step-id]")
    );

    function clearDragOver() {
      tabsEls.forEach((t) => t.classList.remove("drag-over"));
    }

    tabsEls.forEach((tabEl) => {
      tabEl.addEventListener("dragstart", (e) => {
        dragEl = tabEl;
        tabEl.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tabEl.dataset.stepId || "");
      });
      tabEl.addEventListener("dragend", () => {
        tabEl.classList.remove("dragging");
        clearDragOver();
        dragEl = null;
      });
      tabEl.addEventListener("dragover", (e) => {
        if (!dragEl || dragEl === tabEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        tabEl.classList.add("drag-over");
      });
      tabEl.addEventListener("dragleave", (e) => {
        if (!tabEl.contains(e.relatedTarget)) tabEl.classList.remove("drag-over");
      });
      tabEl.addEventListener("drop", (e) => {
        e.preventDefault();
        tabEl.classList.remove("drag-over");
        if (!dragEl || dragEl === tabEl) return;
        tabEl.parentNode.insertBefore(dragEl, tabEl);
        const entry = currentEntry();
        if (entry) {
          const order = Array.from(
            container.querySelectorAll(".step-tab[data-step-id]")
          ).map((btn) => btn.dataset.stepId);
          entry.stepOrder = VasConfig.normalizeStepOrder(order, entry.steps);
        }
        renderEditor();
        renderPreview();
      });
    });
  }

  function renderStepTabs() {
    const entry = currentEntry();
    if (!els.stepPickerWrap || !els.stepTabs) return;
    const show = tab === "types" && !!entry;
    els.stepPickerWrap.style.display = show ? "" : "none";
    if (!show) {
      selectedStepId = null;
      return;
    }
    ensureStepOrder(entry);
    const keys = entry.stepOrder;
    if (!selectedStepId || !keys.includes(selectedStepId)) {
      selectedStepId = keys[0] || null;
    }
    const tabsHtml = keys
      .map((key) => {
        const active = key === selectedStepId ? " active" : "";
        const wmsClass = stepTabWmsClass(key);
        return `<button type="button" class="step-tab ${wmsClass}${active}" role="tab" data-step-id="${esc(
          key
        )}" draggable="true" aria-selected="${
          key === selectedStepId
        }">${esc(key)}</button>`;
      })
      .join("");
    els.stepTabs.innerHTML =
      tabsHtml +
      `<button type="button" class="step-tab step-tab-add" data-step-add="1" aria-label="Add step"><i class="fa-solid fa-plus"></i></button>`;

    if (els.removeStepBtn) els.removeStepBtn.disabled = !selectedStepId;

    els.stepTabs.querySelectorAll(".step-tab[data-step-id]").forEach((btn) => {
      btn.onclick = () => {
        syncEditorToDraft();
        selectedStepId = btn.dataset.stepId;
        renderEditor();
        renderPreview();
      };
      btn.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameStep(btn.dataset.stepId);
      };
    });

    const addBtn = els.stepTabs.querySelector(".step-tab-add");
    if (addBtn) {
      addBtn.onclick = async () => {
        syncEditorToDraft();
        const curEntry = currentEntry();
        if (!curEntry || tab !== "types") return;
        const raw = prompt(
          "AssignedServiceStepId for this step (must match MAWM):"
        );
        const stepId = String(raw || "").trim();
        if (!stepId) return;
        if (!curEntry.steps) curEntry.steps = {};
        if (curEntry.steps[stepId]) {
          selectedStepId = stepId;
          status(`Step “${stepId}” already exists — selected it`, "info");
        } else {
          curEntry.steps[stepId] = VasConfig.normalizeStepEntry(
            { title: stepId, content: [] },
            stepId
          );
          selectedStepId = stepId;
        }
        ensureStepOrder(curEntry);
        renderEditor();
        renderPreview();
        await refreshWmsStepMatch();
      };
    }

    bindStepTabDrag();
  }

  function updateAddEntryLabel() {
    if (els.addEntryBtnLabel) {
      els.addEntryBtnLabel.textContent =
        tab === "types" ? "Add VAS Type" : "Add Item";
    }
  }

  function renderEntrySelect() {
    if (!draft) {
      els.entrySelect.innerHTML = "";
      els.entrySelect.disabled = true;
      els.deleteKeyBtn.disabled = true;
      return;
    }
    const keys = Object.keys(draft[bucket()] || {}).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    els.entrySelectLabel.textContent = tab === "types" ? "VAS Type" : "Item";
    if (!keys.length) {
      els.entrySelect.innerHTML =
        tab === "types"
          ? '<option value="">No VAS Types</option>'
          : '<option value="">No Items — use Add Item</option>';
      els.entrySelect.disabled = true;
      selectedKey = null;
      selectedStepId = null;
      els.deleteKeyBtn.disabled = true;
      updateAddEntryLabel();
      return;
    }
    if (!selectedKey || !keys.includes(selectedKey)) {
      selectedKey = keys[0];
    }
    els.entrySelect.disabled = false;
    els.entrySelect.innerHTML = keys
      .map(
        (key) =>
          `<option value="${esc(key)}"${
            key === selectedKey ? " selected" : ""
          }>${esc(key)}</option>`
      )
      .join("");
    els.deleteKeyBtn.disabled = !selectedKey;
    updateAddEntryLabel();
  }

  function renderEditor() {
    const entry = currentEntry();
    if (!entry) {
      els.editor.style.display = "none";
      els.deleteKeyBtn.disabled = true;
      return;
    }
    els.editor.style.display = "block";
    els.deleteKeyBtn.disabled = false;
    els.edTitle.value = entry.title || selectedKey;
    els.edDescription.value = entry.description || "";
    if (els.edIconUrlWrap) {
      els.edIconUrlWrap.style.display = tab === "types" ? "" : "none";
    }
    if (els.edIconUrl) {
      els.edIconUrl.value =
        tab === "types" ? entry.iconUrl || VasConfig.DEFAULT_TYPE_ICON_URL : "";
      syncIconPreview();
    }
    renderStepTabs();
    updateAddEntryLabel();

    if (els.contentSectionLabel) {
      els.contentSectionLabel.textContent =
        tab === "types"
          ? "Step content (instructions & images)"
          : "Content (instructions & images)";
    }

    const owner = contentOwner();
    const canEditContent = tab === "items" || !!selectedStepId;

    if (els.columnCountWrap) {
      els.columnCountWrap.style.display =
        tab === "types" && selectedStepId ? "" : "none";
    }

    if (!canEditContent) {
      els.contentList.innerHTML = "";
    } else if (tab === "types") {
      owner.layout = VasConfig.normalizeLayout(
        owner.layout,
        owner.content || []
      );
      const columns = owner.layout.columns;
      if (els.columnCountSelect) {
        els.columnCountSelect.value = String(columns.length);
      }
      const byId = {};
      (owner.content || []).forEach((b) => {
        if (b && b.id) byId[b.id] = b;
      });
      let rowIdx = 0;
      const panesHtml = columns
        .map((col, ci) => {
          const blocks = (col.blockIds || [])
            .map((id) => byId[id])
            .filter(Boolean);
          const rowsHtml = blocks
            .map((block) => contentRowHtml(block, rowIdx++))
            .join("");
          return `<div class="content-column-pane" data-col-id="${esc(
            col.id
          )}" data-col-width="${col.width}" data-col-index="${ci}">
            <div class="content-column-header">Column ${ci + 1}</div>
            <div class="content-column-body">${rowsHtml}</div>
          </div>`;
        })
        .join("");
      els.contentList.innerHTML = `<div class="content-columns-editor" style="display:grid; grid-template-columns: repeat(${columns.length}, 1fr); gap:0.6rem;">${panesHtml}</div>`;
    } else {
      const content = owner ? owner.content || [] : [];
      els.contentList.innerHTML = content
        .map((block, idx) => contentRowHtml(block, idx))
        .join("");
    }

    els.contentList.querySelectorAll(".rm-content").forEach((btn) => {
      btn.onclick = () => {
        btn.closest(".content-row")?.remove();
        syncEditorToDraft();
        renderPreview();
      };
    });
    els.contentList.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.onclick = () => {
        btn.classList.toggle("active");
        syncEditorToDraft();
        renderPreview();
      };
    });
    els.contentList
      .querySelectorAll(".img-scale, .txt-scale")
      .forEach((range) => {
        const label = range
          .closest(".img-scale-label")
          ?.querySelector(".img-scale-value");
        range.oninput = () => {
          if (label) label.textContent = `${range.value}%`;
          syncEditorToDraft();
          renderPreview();
        };
      });
    els.contentList
      .querySelectorAll(
        "textarea, input.img-url, input.img-caption, input.fmt-color"
      )
      .forEach((el) => {
        el.oninput = () => {
          if (el.classList.contains("img-url")) {
            const badge = el
              .closest(".content-row")
              ?.querySelector(".pdf-url-badge");
            if (badge) {
              badge.classList.toggle("d-none", !VasConfig.isPdfUrl(el.value));
            }
          }
          syncEditorToDraft();
          renderPreview();
        };
      });
    els.contentList.querySelectorAll("select.fmt-marker").forEach((el) => {
      el.onchange = el.oninput = () => {
        syncEditorToDraft();
        renderPreview();
      };
    });
    if (canEditContent) bindContentDrag();

    els.secSig.checked = !!(entry.sections?.signature?.enabled);
    els.secPhotos.checked = !!(entry.sections?.photos?.enabled);
    els.secMarkup.checked = !!(entry.sections?.markupPad?.enabled);
  }

  const PREVIEW_THEME_KEY = "vasAdminPreviewTheme";

  function applyPreviewTheme() {
    if (previewThemeScope && window.InspectionThemes) {
      InspectionThemes.loadPreviewTheme(
        previewThemeScope,
        previewDeviceLogo,
        PREVIEW_THEME_KEY
      );
    }
  }

  function buildCardHtml(entry, sections) {
    const contentHtml =
      tab === "types"
        ? selectedStepId && entry.steps?.[selectedStepId]
          ? VasConfig.renderStepContentHtml(entry.steps[selectedStepId], esc)
          : ""
        : VasConfig.renderContentListHtml(entry.content || [], esc);
    const iconHtml =
      tab === "types"
        ? `<img class="service-type-icon" src="${esc(
            VasConfig.typeIconUrl(entry)
          )}" alt="" onerror="this.remove()" />`
        : "";
    return `
      <article class="service-card">
        <div class="service-header preview-service-header">
          <div>
            <div class="service-title">${esc(entry.title)}</div>
            <div class="text-muted small mb-0">${esc(entry.description || "")}</div>
          </div>
          ${iconHtml}
        </div>
        <div class="vas-config-block ${tab === "items" ? "item-block" : "type-block"}">
          ${tab === "items" ? "<h4>Item instructions</h4>" : ""}
          ${contentHtml || "<p class='text-muted'>No content</p>"}
        </div>
        <div class="capture-sections">
          ${
            sections.signature.enabled
              ? `<div class="capture-section signature-section" data-capture="signature">
                  <div class="capture-section-header">
                    <label>${esc(sections.signature.label)}</label>
                    <button type="button" class="btn btn-sm btn-secondary pad-clear-btn sig-clear">Clear Signature</button>
                  </div>
                  <div class="signature-pad-wrapper is-empty">
                    <div class="signature-pad-placeholder"><i class="fa-solid fa-signature"></i><span>Sign here</span></div>
                    <canvas class="signature-canvas"></canvas>
                  </div>
                </div>`
              : ""
          }
          ${
            sections.photos.enabled
              ? `<div class="capture-section photo-capture" data-capture="photos">
                  <div class="capture-section-header"><label>${esc(sections.photos.label)}</label></div>
                  <p class="photos-hint"><i class="fas fa-camera"></i> Camera icon (execution upper left)</p>
                  <div class="photo-strip"></div>
                </div>`
              : ""
          }
          ${
            sections.markupPad.enabled
              ? `<div class="capture-section damage-pad-section" data-capture="markup">
                  <div class="capture-section-header damage-pad-header">
                    <label>${esc(sections.markupPad.label)}</label>
                    <div class="damage-pad-controls">
                      <button type="button" class="btn btn-sm btn-secondary damage-pad-photo-btn markup-camera"><i class="fas fa-camera"></i></button>
                      <button type="button" class="btn btn-sm btn-secondary pad-clear-btn markup-clear-photo" style="display:none">Clear Photo</button>
                      <button type="button" class="btn btn-sm btn-secondary pad-clear-btn markup-clear">Clear Marks</button>
                    </div>
                  </div>
                  <div class="damage-pad-wrapper markup-pad is-empty show-empty-placeholder">
                    <div class="damage-pad-empty-placeholder"><i class="fa-solid fa-plus"></i></div>
                    <canvas class="markup-bg"></canvas>
                    <canvas class="markup-draw"></canvas>
                  </div>
                  <input type="file" class="markup-file" accept="image/*" hidden />
                </div>`
              : ""
          }
        </div>
      </article>`;
  }

  function setPreviewMode(mode) {
    previewMode = mode === "desktop" ? "desktop" : "mobile";
    els.previewDesktopBtn.classList.toggle("active", previewMode === "desktop");
    els.previewMobileBtn.classList.toggle("active", previewMode === "mobile");
    renderPreview();
  }

  function renderPreview() {
    syncEditorToDraft();
    const entry = currentEntry();
    if (!entry) {
      previewThemeScope = null;
      previewDeviceLogo = null;
      els.previewHost.innerHTML = "";
      return;
    }
    const typeCfg = tab === "types" ? entry : null;
    const itemCfg = tab === "items" ? entry : null;
    const sections = VasConfig.mergedSections(typeCfg, itemCfg);
    const cardHtml = buildCardHtml(entry, sections);
    const chromeTitle =
      previewMode === "desktop" ? "VAS Workbench" : "VAS Execution";
    const chrome = `
      <div class="device-app-chrome">
        <span class="device-chrome-icon" aria-hidden="true"><i class="fas fa-tags"></i></span>
        <div class="device-chrome-center">
          <img id="previewDeviceLogo" class="device-theme-logo" alt="" />
          <div class="device-chrome-title">${chromeTitle}</div>
        </div>
        <span class="device-chrome-icon device-chrome-spacer" aria-hidden="true"></span>
      </div>`;

    if (previewMode === "desktop") {
      els.previewHost.innerHTML = `
        <div class="preview-fullscreen">
          <div class="preview-theme-scope" id="previewThemeScope">
            ${chrome}
            <div class="preview-form-theme-wrap" id="previewFormRoot">
              ${cardHtml}
            </div>
          </div>
        </div>`;
    } else {
      els.previewHost.innerHTML = `
        <div class="device-frame-wrap">
          <div class="device-frame" aria-label="Mobile preview 360 by 640">
            <div class="device-earpiece"></div>
            <div class="device-screen" id="previewThemeScope">
              ${chrome}
              <div class="device-form-body">
                <div class="device-screen-scroll preview-form-theme-wrap" id="previewFormRoot">
                  ${cardHtml}
                </div>
              </div>
            </div>
            <div class="device-home-btn"></div>
          </div>
        </div>`;
    }

    const scrollEl = els.previewHost.querySelector("#previewFormRoot");
    previewThemeScope = els.previewHost.querySelector("#previewThemeScope");
    previewDeviceLogo = els.previewHost.querySelector("#previewDeviceLogo");
    applyPreviewTheme();

    if (window.VasPads && scrollEl) window.VasPads.bindAllPads(scrollEl);
    if (typeof window.bindItemImagePreview === "function" && scrollEl) {
      delete scrollEl.dataset.itemImagePreviewBound;
      window.bindItemImagePreview(scrollEl);
    }
    if (window.VasImageModal) {
      window.VasImageModal.bindTriggers(scrollEl || els.previewHost);
    }
  }

  function openPreviewThemeModal() {
    if (!window.InspectionThemes || !themeModal) return;
    InspectionThemes.renderPreviewThemeList(themeList, themeModal, {
      scopeEl: previewThemeScope,
      logoEl: previewDeviceLogo,
      storageKey: PREVIEW_THEME_KEY
    });
    themeModal.show();
  }

  async function loadDraft() {
    const bust = `?t=${Date.now()}`;
    const defaultsRaw = await fetchJson(`/config/vas.default.json${bust}`);
    if (!defaultsRaw) {
      status("Could not load /config/vas.default.json", "error");
      draft = VasConfig.emptyConfig();
      renderEntrySelect();
      renderEditor();
      renderPreview();
      return;
    }
    defaultsDoc = VasConfig.normalizeConfig(defaultsRaw);
    const orgDoc = await fetchJson(
      `/config/orgs/${encodeURIComponent(org)}.json${bust}`
    );
    draft = orgDoc
      ? VasConfig.mergeVasConfigs(defaultsDoc, orgDoc)
      : VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));
    selectedKey = Object.keys(draft.vasTypes)[0] || null;
    tab = "types";
    els.configTabSelect.value = "types";
    renderEntrySelect();
    renderEditor();
    renderPreview();
    status(
      `Authenticated (${org}) — ${Object.keys(draft.vasTypes).length} VAS Types, ${
        Object.keys(draft.items).length
      } Items`,
      "success"
    );
    await refreshWmsStepMatch();
  }

  async function authenticate() {
    const value = (els.orgInput.value || "").trim().toUpperCase();
    if (!value) return status("ORG required", "error");
    status("Authenticating...");
    const res = await api("auth", { org: value });
    if (!res.success) return status(res.error || "Auth failed", "error");
    token = res.token;
    org = res.org || value;
    localStorage.setItem("vas_lastOrg", org);
    els.orgSection.style.display = "none";
    els.mainUI.style.display = "block";
    await loadDraft();
  }

  async function switchTab(next) {
    syncEditorToDraft();
    tab = next === "items" ? "items" : "types";
    els.configTabSelect.value = tab;
    const keys = Object.keys(draft?.[bucket()] || {});
    selectedKey = keys[0] || null;
    selectedStepId = null;
    updateAddEntryLabel();
    renderEntrySelect();
    renderEditor();
    renderPreview();
    if (tab === "types") await refreshWmsStepMatch();
    else {
      wmsStepIds = null;
      wmsStepsForKey = null;
    }
  }

  /** Change the step's column count; merges/creates columns as needed. */
  function setColumnCount(n) {
    syncEditorToDraft();
    const owner = contentOwner();
    if (!owner) return;
    const count = Math.max(
      1,
      Math.min(VasConfig.MAX_STEP_COLUMNS, Number(n) || 1)
    );
    const current = (owner.layout && owner.layout.columns) || [];
    let nextCols = current.map((c) => ({
      id: c.id,
      width: c.width,
      blockIds: c.blockIds.slice()
    }));
    if (count > nextCols.length) {
      while (nextCols.length < count) {
        nextCols.push({ id: nid("col"), width: 1, blockIds: [] });
      }
    } else if (count < nextCols.length) {
      const merged = nextCols
        .slice(count - 1)
        .reduce((acc, c) => acc.concat(c.blockIds), []);
      nextCols = nextCols
        .slice(0, count - 1)
        .concat([{ ...nextCols[count - 1], blockIds: merged }]);
    }
    owner.layout = VasConfig.normalizeLayout(
      { columns: nextCols },
      owner.content || []
    );
    renderEditor();
    renderPreview();
  }

  if (els.columnCountSelect) {
    els.columnCountSelect.onchange = () =>
      setColumnCount(els.columnCountSelect.value);
  }

  els.configTabSelect.onchange = () => switchTab(els.configTabSelect.value);

  els.entrySelect.onchange = async () => {
    syncEditorToDraft();
    selectedKey = els.entrySelect.value || null;
    selectedStepId = null;
    els.deleteKeyBtn.disabled = !selectedKey;
    wmsStepIds = null;
    wmsStepsForKey = null;
    renderEditor();
    renderPreview();
    if (tab === "types") await refreshWmsStepMatch();
  };

  if (els.removeStepBtn) {
    els.removeStepBtn.onclick = () => {
      syncEditorToDraft();
      const entry = currentEntry();
      if (!entry || !selectedStepId || tab !== "types") return;
      if (!confirm(`Remove step “${selectedStepId}”?`)) return;
      delete entry.steps[selectedStepId];
      ensureStepOrder(entry);
      selectedStepId = stepKeys(entry)[0] || null;
      renderEditor();
      renderPreview();
    };
  }

  els.previewDesktopBtn.onclick = () => setPreviewMode("desktop");
  els.previewMobileBtn.onclick = () => setPreviewMode("mobile");

  document.getElementById("addInstrBtn").onclick = () => {
    syncEditorToDraft();
    const owner = contentOwner();
    if (!owner) {
      return status(
        tab === "types"
          ? "Add or select a step before adding content"
          : "Select an item first",
        "error"
      );
    }
    if (!Array.isArray(owner.content)) owner.content = [];
    const block = {
      id: nid("ins"),
      type: "text",
      text: "",
      bold: false,
      italic: false,
      underline: false,
      color: VasConfig.DEFAULT_TEXT_COLOR,
      fontSize: 100,
      listMarker: VasConfig.DEFAULT_LIST_MARKER
    };
    owner.content.push(block);
    appendBlockToLastColumn(owner, block.id);
    renderEditor();
    renderPreview();
  };
  document.getElementById("addImageBtn").onclick = () => {
    syncEditorToDraft();
    const owner = contentOwner();
    if (!owner) {
      return status(
        tab === "types"
          ? "Add or select a step before adding content"
          : "Select an item first",
        "error"
      );
    }
    if (!Array.isArray(owner.content)) owner.content = [];
    const block = {
      id: nid("img"),
      type: "image",
      url: "",
      caption: "",
      scale: 100
    };
    owner.content.push(block);
    appendBlockToLastColumn(owner, block.id);
    renderEditor();
    renderPreview();
  };
  ["secSig", "secPhotos", "secMarkup", "edTitle", "edDescription", "edIconUrl"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = el.oninput = () => {
        if (id === "edIconUrl") syncIconPreview();
        syncEditorToDraft();
        renderPreview();
      };
    }
  );

  els.deleteKeyBtn.onclick = () => {
    if (!selectedKey) return;
    if (!confirm(`Remove ${selectedKey} from draft?`)) return;
    delete draft[bucket()][selectedKey];
    selectedKey = Object.keys(draft[bucket()])[0] || null;
    selectedStepId = null;
    renderEntrySelect();
    renderEditor();
    renderPreview();
  };

  if (els.addEntryBtn) {
    els.addEntryBtn.onclick = async () => {
      if (tab === "types") {
        const raw = prompt("ProvidedServiceId / VAS Type name:");
        const key = String(raw || "").trim();
        if (!key) return;
        selectedKey = key;
        ensureEntry(selectedKey);
        selectedStepId = null;
        wmsStepIds = null;
        wmsStepsForKey = null;
        renderEntrySelect();
        renderEditor();
        renderPreview();
        await refreshWmsStepMatch();
        return;
      }
      const itemId = prompt("ItemId to add:");
      if (!itemId || !itemId.trim()) return;
      selectedKey = itemId.trim();
      ensureEntry(selectedKey);
      renderEntrySelect();
      renderEditor();
      renderPreview();
    };
  }

  document.getElementById("exportBtn").onclick = () => {
    syncEditorToDraft();
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vas-config-${org || "draft"}.json`;
    a.click();
  };
  document.getElementById("importFile").onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      draft = VasConfig.normalizeConfig(JSON.parse(text));
      selectedKey = Object.keys(draft[bucket()])[0] || null;
      renderEntrySelect();
      renderEditor();
      renderPreview();
      status("Imported into local draft (not deployed)", "success");
    } catch (err) {
      status(err.message || "Import failed", "error");
    }
    e.target.value = "";
  };
  document.getElementById("resetBtn").onclick = async () => {
    if (!confirm("Reset draft to shared defaults?")) return;
    if (!defaultsDoc) return status("Defaults not loaded", "error");
    draft = VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));
    selectedKey = Object.keys(draft.vasTypes)[0] || null;
    switchTab("types");
    status("Draft reset to defaults", "success");
  };
  document.getElementById("saveBtn").onclick = async () => {
    syncEditorToDraft();
    status("Saving to GitHub...");
    const payload = {
      version: draft.version || 1,
      updatedAt: new Date().toISOString(),
      vasTypes: draft.vasTypes,
      items: draft.items
    };
    const res = await api("save_vas_config", { org, token, config: payload });
    if (!res.success) return status(res.error || "Save failed", "error");
    status(res.message || "Saved", "success");
  };

  if (els.previewThemeBtn) {
    els.previewThemeBtn.onclick = openPreviewThemeModal;
  }

  els.orgBtn.onclick = authenticate;
  els.orgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authenticate();
  });

  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const ci = {};
    for (const [key, value] of params.entries()) {
      ci[String(key).toLowerCase()] = value;
    }
    return {
      org: String(ci.org || ci.organization || "").trim(),
      theme: String(ci.theme || "").trim()
    };
  }

  const urlParams = parseUrlParams();
  const last = localStorage.getItem("vas_lastOrg");
  if (urlParams.org) els.orgInput.value = urlParams.org.toUpperCase();
  else if (last) els.orgInput.value = last;

  (async function bootstrap() {
    const session = await api("session", {});
    const remembered = urlParams.org || session.org || last;
    if (remembered) els.orgInput.value = String(remembered).toUpperCase();
    if ((session.has_token && remembered) || urlParams.org) {
      await authenticate();
    }
  })();
})();
