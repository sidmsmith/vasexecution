(function () {
  const VasConfig = window.VasConfig;
  let token = null;
  let org = null;
  let defaultsDoc = null;
  let draft = null;
  /** Freshly-fetched deployed doc (defaults + org overlay) captured at loadDraft() time. */
  let deployedSnapshot = null;
  let localPersistTimer = null;
  let tab = "types"; // types | items
  let selectedKey = null;
  let selectedStepId = null;
  /** @type {Set<string>|null} ProvidedServiceStepId set for selected VAS Type from MAWM */
  let wmsStepIds = null;
  /** @type {Map<string, Set<string>>|null} stepId -> normalized WMS instruction texts, for the selected VAS Type */
  let wmsInstructionTextsByStep = null;
  /** selectedKey the current wmsStepIds set belongs to */
  let wmsStepsForKey = null;
  let wmsStepsFetchGen = 0;
  let previewThemeScope = null;
  let previewDeviceLogo = null;
  let previewMode = localStorage.getItem("vas_previewMode") === "desktop" ? "desktop" : "mobile";

  // ===== Mobile execution preview (Types tab only — see buildCardHtml/
  // renderPreview for Desktop mode and the Items tab, both unchanged) =====
  let mobilePreviewScreen = "types"; // "types" | "steps"
  let mobilePreviewActiveKey = null;
  /** @type {Object<string, Set<string>>} typeKey -> completed stepId set (preview-only, never saved) */
  const mobilePreviewCompleted = {};
  /** @type {Object<string, Object<string, number>>} typeKey -> stepId -> staged qty (preview-only) */
  const mobilePreviewStaged = {};
  /** `${tab}|${selectedKey}|${selectedStepId}` as of the last mobile-preview render; undefined = never rendered yet */
  let mobilePreviewLastSelection;

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
    discardLocalBtn: document.getElementById("discardLocalBtn"),
    draftDirtyBadge: document.getElementById("draftDirtyBadge"),
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

  function draftStorageKey() {
    return org ? `vas_draft:${org}` : null;
  }

  function configsEqual(a, b) {
    return (
      JSON.stringify(VasConfig.normalizeConfig(a)) ===
      JSON.stringify(VasConfig.normalizeConfig(b))
    );
  }

  function updateDirtyIndicator() {
    if (!els.draftDirtyBadge) return;
    const dirty = !!(draft && deployedSnapshot && !configsEqual(draft, deployedSnapshot));
    els.draftDirtyBadge.classList.toggle("d-none", !dirty);
  }

  /** Immediate write-through to localStorage; used at explicit checkpoints. */
  function persistDraftLocal() {
    const key = draftStorageKey();
    if (!key || !draft) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: draft.version || 1,
          vasTypes: draft.vasTypes,
          items: draft.items,
          savedAt: new Date().toISOString()
        })
      );
    } catch (e) {
      // Private browsing / quota exceeded — degrade silently, editing still works.
    }
    updateDirtyIndicator();
  }

  /** Debounced autosave — called from renderPreview() on every edit. */
  function scheduleLocalPersist() {
    clearTimeout(localPersistTimer);
    localPersistTimer = setTimeout(persistDraftLocal, 500);
  }

  function readLocalDraft() {
    const key = draftStorageKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearLocalDraft() {
    const key = draftStorageKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeInstrText(text) {
    return String(text ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
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
    const wmsClass = contentBlockWmsClass(block.text);
    return `<div class="content-row instruction-row draggable-item${
      wmsClass ? " " + wmsClass : ""
    }" data-idx="${idx}" data-type="text" data-id="${esc(
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
   * Load ProvidedServiceStepIds + instruction texts from MAWM for the
   * selected VAS Type and recolor tabs + content blocks.
   * Called when the type is selected and after step create/rename.
   */
  async function refreshWmsStepMatch() {
    if (tab !== "types" || !selectedKey || !org || !token) {
      wmsStepIds = null;
      wmsInstructionTextsByStep = null;
      wmsStepsForKey = null;
      applyStepTabWmsClasses();
      applyContentBlockWmsClasses();
      return;
    }
    const typeId = String(selectedKey || "").trim();
    const gen = ++wmsStepsFetchGen;
    wmsStepIds = null;
    wmsInstructionTextsByStep = null;
    wmsStepsForKey = null;
    applyStepTabWmsClasses();
    applyContentBlockWmsClasses();
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
      wmsInstructionTextsByStep = null;
      wmsStepsForKey = null;
      applyStepTabWmsClasses();
      applyContentBlockWmsClasses();
      status(res.error || "Could not load WMS steps for tab colors", "error");
      return;
    }
    const svc = (res.services || []).find(
      (s) => s && String(s.ProvidedServiceId || "").trim() === typeId
    );
    const wmsSteps =
      svc && Array.isArray(svc.ProvidedServiceStep) ? svc.ProvidedServiceStep : [];
    wmsStepIds = new Set(
      wmsSteps
        .map((s) => s && s.ProvidedServiceStepId)
        .filter(Boolean)
        .map((id) => String(id).trim())
        .filter(Boolean)
    );
    wmsInstructionTextsByStep = new Map(
      wmsSteps
        .filter((s) => s && s.ProvidedServiceStepId)
        .map((s) => [
          String(s.ProvidedServiceStepId).trim(),
          new Set(
            (Array.isArray(s.Instructions) ? s.Instructions : [])
              .map((i) => i && normalizeInstrText(i.InstructionText))
              .filter(Boolean)
          )
        ])
    );
    wmsStepsForKey = selectedKey;
    applyStepTabWmsClasses();
    applyContentBlockWmsClasses();
  }

  function stepTabWmsClass(stepId) {
    if (wmsStepIds == null || wmsStepsForKey !== selectedKey) {
      return "step-tab-wms-unknown";
    }
    return wmsStepIds.has(String(stepId || "").trim())
      ? "step-tab-wms-ok"
      : "step-tab-wms-missing";
  }

  /** Content block's text exists (verbatim, normalized) in WMS for the current step. */
  function contentBlockWmsClass(text) {
    if (
      wmsInstructionTextsByStep == null ||
      wmsStepsForKey !== selectedKey ||
      tab !== "types" ||
      !selectedStepId
    ) {
      return null;
    }
    const wmsTexts = wmsInstructionTextsByStep.get(String(selectedStepId).trim());
    if (!wmsTexts) return "content-wms-missing";
    const norm = normalizeInstrText(text);
    if (!norm) return null;
    return wmsTexts.has(norm) ? "content-wms-ok" : "content-wms-missing";
  }

  /** Recolor each text content block to reflect whether its exact text exists in WMS. */
  function applyContentBlockWmsClasses() {
    if (!els.contentList) return;
    els.contentList
      .querySelectorAll(".content-row.instruction-row")
      .forEach((row) => {
        row.classList.remove("content-wms-ok", "content-wms-missing");
        const textarea = row.querySelector("textarea");
        const cls = textarea ? contentBlockWmsClass(textarea.value) : null;
        if (cls) row.classList.add(cls);
      });
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
    const raw = await promptDialog(
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
        const raw = await promptDialog(
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
          if (el.tagName === "TEXTAREA") {
            const row = el.closest(".content-row");
            if (row) {
              row.classList.remove("content-wms-ok", "content-wms-missing");
              const cls = contentBlockWmsClass(el.value);
              if (cls) row.classList.add(cls);
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

  /** Desktop preview only shows one step's content at a time, with nothing
   *  indicating which step or what its qty/status would look like — unlike
   *  the mobile preview's per-step card. This mimics the real execution
   *  table's Step/Description/Requested/Remaining/Completed/Status row so
   *  desktop preview reads the same way, with Requested/Remaining/Completed/
   *  Status hardcoded (1/1/0/Created) since this is a static preview.
   *  TODO(step-description): steps only store `title` (always == step id)
   *  today — there's no real per-step Description field, so "Description"
   *  below is just the step name again as a stand-in. If we ever want a
   *  genuine description: add `description` to normalizeStepEntry in
   *  vas-config.js, an input in admin.html between the Steps tabs and Step
   *  content (wired like edTitle/edDescription), and use it here + in
   *  mobilePreviewStepCardHtml + (as a fallback when WMS StepDescription is
   *  blank) in app.js's stepRowCellsHtml/mobileStepCardHtml. Logged in
   *  vasexecution-open-items.md if this gets picked up later. */
  function desktopPreviewStepHeaderHtml(step, stepId) {
    const name = step.title || stepId;
    return `<table class="steps-table compact step-preview-table">
      <colgroup>
        <col class="col-step" />
        <col class="col-desc" />
        <col class="col-num" />
        <col class="col-num" />
        <col class="col-num" />
        <col class="col-status" />
      </colgroup>
      <thead>
        <tr>
          <th>Step</th>
          <th>Description</th>
          <th class="step-num">Requested</th>
          <th class="step-num">Remaining</th>
          <th class="step-num">Completed</th>
          <th class="step-status">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(name)}</td>
          <td class="step-desc">${esc(name)}</td>
          <td class="step-num">1</td>
          <td class="step-num">1</td>
          <td class="step-num">0</td>
          <td class="step-status"><span class="badge status-chip status-created">Created</span></td>
        </tr>
      </tbody>
    </table>`;
  }

  function buildCardHtml(entry, sections) {
    const selectedStep =
      tab === "types" && selectedStepId ? entry.steps?.[selectedStepId] : null;
    const contentHtml = selectedStep
      ? VasConfig.renderStepContentHtml(selectedStep, esc)
      : tab === "items"
      ? VasConfig.renderContentListHtml(entry.content || [], esc)
      : "";
    const stepHeaderHtml = selectedStep
      ? desktopPreviewStepHeaderHtml(selectedStep, selectedStepId)
      : "";
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
        ${stepHeaderHtml}
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

  function mobilePreviewCompletedSet(typeKey) {
    if (!mobilePreviewCompleted[typeKey]) mobilePreviewCompleted[typeKey] = new Set();
    return mobilePreviewCompleted[typeKey];
  }

  function mobilePreviewStagedFor(typeKey, stepId) {
    if (!mobilePreviewStaged[typeKey]) mobilePreviewStaged[typeKey] = {};
    if (!(stepId in mobilePreviewStaged[typeKey])) mobilePreviewStaged[typeKey][stepId] = 1;
    return mobilePreviewStaged[typeKey][stepId];
  }

  /** Tapping a card from the Type list is always a fresh "enter" — resets
   *  that Type's preview-only completed/staged state even if it's the same
   *  Type as last time (force:true). Following the editor's own selection
   *  (mobilePreviewSyncSelection) only resets when it actually switches to
   *  a *different* Type — so clicking a different step tab within the
   *  SAME already-active Type doesn't wipe out what's showing. */
  function mobilePreviewEnterType(key, { force = false } = {}) {
    if (force || mobilePreviewActiveKey !== key) {
      delete mobilePreviewCompleted[key];
      delete mobilePreviewStaged[key];
    }
    mobilePreviewActiveKey = key;
    mobilePreviewScreen = "steps";
  }

  /** Mirrors the single-card preview's "always shows what's being edited"
   *  behavior for every SUBSEQUENT selection change — but the very first
   *  mobile-preview render starts on the Type list (not whatever happened
   *  to be selected already), per the user's explicit request. */
  function mobilePreviewSyncSelection() {
    const selection = `${tab}|${selectedKey || ""}|${selectedStepId || ""}`;
    if (mobilePreviewLastSelection === undefined) {
      mobilePreviewLastSelection = selection;
      return;
    }
    if (selection === mobilePreviewLastSelection) return;
    mobilePreviewLastSelection = selection;
    if (tab === "types" && selectedKey) {
      mobilePreviewEnterType(selectedKey);
    }
  }

  function mobilePreviewTypeCardHtml(key, entry) {
    const stepCount = VasConfig.orderedStepIds(entry).length;
    const isEditing = tab === "types" && key === selectedKey;
    const iconHtml = `<img class="mx-type-card-icon" src="${esc(
      VasConfig.typeIconUrl(entry)
    )}" alt="" onerror="this.remove()" />`;
    return `<div class="mx-type-card" data-mobile-preview-type="${esc(key)}">
      <div class="mx-type-card-top">
        <span class="mx-type-card-id">${iconHtml}${esc(entry.title || key)}</span>
        ${isEditing ? '<span class="badge bg-primary">Editing</span>' : ""}
      </div>
      ${
        entry.description
          ? `<div class="text-muted small mb-1">${esc(entry.description)}</div>`
          : ""
      }
      <div class="mx-type-card-meta">
        <span><strong>Steps</strong> ${stepCount}</span>
      </div>
    </div>`;
  }

  function mobilePreviewTypesScreenHtml() {
    const keys = Object.keys(draft.vasTypes || {}).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    if (!keys.length) {
      return '<p class="text-muted mb-0">No VAS Types configured.</p>';
    }
    return `<div class="mx-type-list">${keys
      .map((key) => mobilePreviewTypeCardHtml(key, draft.vasTypes[key]))
      .join("")}</div>`;
  }

  function mobilePreviewQtyRowHtml(typeKey, stepId) {
    const remaining = 1;
    const staged = mobilePreviewStagedFor(typeKey, stepId);
    return `<div class="mx-step-qty-row">
      <div class="mx-stepper">
        <button type="button" data-mobile-preview-qty-dec="${esc(stepId)}"${
          staged <= 0 ? " disabled" : ""
        }>&minus;</button>
        <span class="mx-qty-value">${staged}</span>
        <button type="button" data-mobile-preview-qty-inc="${esc(stepId)}"${
          staged >= remaining ? " disabled" : ""
        }>+</button>
      </div>
      <button type="button" class="mx-complete-btn" data-mobile-preview-complete="${esc(
        stepId
      )}"${staged <= 0 ? " disabled" : ""}>Complete</button>
    </div>`;
  }

  function mobilePreviewStepCardHtml(typeKey, stepId, step) {
    const isComplete = mobilePreviewCompletedSet(typeKey).has(stepId);
    const instructionsHtml = VasConfig.renderStepContentHtml(step, esc);
    return `<div class="mx-step-card${isComplete ? " is-complete" : ""}">
      <div class="mx-step-card-top">
        <span class="mx-step-card-title">${esc(step.title || stepId)}</span>
        <span class="badge status-chip ${
          isComplete ? "status-complete" : "status-created"
        }">${isComplete ? "Complete" : "Created"}</span>
      </div>
      <div class="mx-step-qty-grid">
        <div><strong>1</strong>Requested</div>
        <div><strong>${isComplete ? 0 : 1}</strong>Remaining</div>
        <div><strong>${isComplete ? 1 : 0}</strong>Completed</div>
      </div>
      <div class="vas-config-block">${
        instructionsHtml || "<p class='text-muted mb-0'>No content</p>"
      }</div>
      ${isComplete ? "" : mobilePreviewQtyRowHtml(typeKey, stepId)}
    </div>`;
  }

  function mobilePreviewStepsScreenHtml(typeKey) {
    const entry = draft.vasTypes[typeKey];
    if (!entry) return mobilePreviewTypesScreenHtml();
    const stepIds = VasConfig.orderedStepIds(entry);
    const completedSet = mobilePreviewCompletedSet(typeKey);
    const total = stepIds.length;
    const done = stepIds.filter((id) => completedSet.has(id)).length;
    // total === 0 (a Type with no steps configured yet) also hides Complete
    // All — there's nothing to complete, not "everything" complete.
    const allDone = total === 0 || done >= total;
    const iconHtml = `<img class="mx-type-topbar-icon" src="${esc(
      VasConfig.typeIconUrl(entry)
    )}" alt="" onerror="this.remove()" />`;
    return `<div class="mx-type-topbar">
        <button type="button" class="mx-back-btn" data-mobile-preview-back aria-label="Back to VAS Types">&lsaquo;</button>
        ${iconHtml}
        <div class="mx-type-topbar-text">
          <div class="mx-type-topbar-title">${esc(entry.title || typeKey)}</div>
          <div class="mx-type-topbar-sub">${done} of ${total} step${
            total === 1 ? "" : "s"
          } complete</div>
        </div>
      </div>
      <div class="mx-steps-body">${stepIds
        .map((id) => mobilePreviewStepCardHtml(typeKey, id, entry.steps[id]))
        .join("")}</div>
      <div class="mx-steps-footer">
        <span class="mx-steps-footer-status">${done} of ${total} step${
          total === 1 ? "" : "s"
        } complete</span>
        ${
          allDone
            ? ""
            : `<button type="button" class="mx-steps-cta" data-mobile-preview-complete-all>Complete All</button>`
        }
      </div>`;
  }

  function mobilePreviewScreenHtml() {
    mobilePreviewSyncSelection();
    if (
      mobilePreviewScreen === "steps" &&
      mobilePreviewActiveKey &&
      draft.vasTypes[mobilePreviewActiveKey]
    ) {
      return mobilePreviewStepsScreenHtml(mobilePreviewActiveKey);
    }
    mobilePreviewScreen = "types";
    return mobilePreviewTypesScreenHtml();
  }

  function bindMobilePreviewScreen(scrollEl) {
    if (!scrollEl) return;
    scrollEl.querySelectorAll("[data-mobile-preview-type]").forEach((card) => {
      card.addEventListener("click", () => {
        mobilePreviewEnterType(card.dataset.mobilePreviewType, { force: true });
        renderPreview();
      });
    });
    const back = scrollEl.querySelector("[data-mobile-preview-back]");
    if (back) {
      back.addEventListener("click", () => {
        mobilePreviewScreen = "types";
        renderPreview();
      });
    }
    scrollEl
      .querySelectorAll("[data-mobile-preview-qty-inc], [data-mobile-preview-qty-dec]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const typeKey = mobilePreviewActiveKey;
          const stepId =
            btn.dataset.mobilePreviewQtyInc || btn.dataset.mobilePreviewQtyDec;
          if (!typeKey || !stepId) return;
          const remaining = 1;
          const current = mobilePreviewStagedFor(typeKey, stepId);
          const delta = btn.dataset.mobilePreviewQtyInc ? 1 : -1;
          mobilePreviewStaged[typeKey][stepId] = Math.max(
            0,
            Math.min(remaining, current + delta)
          );
          renderPreview();
        });
      });
    scrollEl.querySelectorAll("[data-mobile-preview-complete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const typeKey = mobilePreviewActiveKey;
        const stepId = btn.dataset.mobilePreviewComplete;
        if (!typeKey || !stepId) return;
        if (mobilePreviewStagedFor(typeKey, stepId) <= 0) return;
        mobilePreviewCompletedSet(typeKey).add(stepId);
        renderPreview();
      });
    });
    const completeAllBtn = scrollEl.querySelector(
      "[data-mobile-preview-complete-all]"
    );
    if (completeAllBtn) {
      completeAllBtn.addEventListener("click", async () => {
        const typeKey = mobilePreviewActiveKey;
        const entry = typeKey && draft.vasTypes[typeKey];
        if (!entry) return;
        const stepIds = VasConfig.orderedStepIds(entry);
        const completedSet = mobilePreviewCompletedSet(typeKey);
        const openCount = stepIds.filter((id) => !completedSet.has(id)).length;
        if (!openCount) return;
        const ok = await confirmDialog(
          openCount === 1
            ? `Complete 1 remaining step for ${esc(entry.title || typeKey)}?`
            : `Complete all ${openCount} remaining steps for ${esc(
                entry.title || typeKey
              )}?`,
          { okLabel: "Complete All" }
        );
        if (!ok) return;
        stepIds.forEach((id) => completedSet.add(id));
        renderPreview();
      });
    }
  }

  function setPreviewMode(mode) {
    previewMode = mode === "desktop" ? "desktop" : "mobile";
    localStorage.setItem("vas_previewMode", previewMode);
    els.previewDesktopBtn.classList.toggle("active", previewMode === "desktop");
    els.previewMobileBtn.classList.toggle("active", previewMode === "mobile");
    renderPreview();
  }

  function renderPreview() {
    syncEditorToDraft();
    scheduleLocalPersist();
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
    // Mobile mode on the Types tab gets the real mobile-execution-style
    // Type list -> steps preview instead of the single-card content Desktop
    // mode (and the Items tab, in either mode) still uses unchanged below.
    const useMobilePreview = previewMode === "mobile" && tab === "types";
    const cardHtml = useMobilePreview
      ? mobilePreviewScreenHtml()
      : buildCardHtml(entry, sections);
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

    if (useMobilePreview) bindMobilePreviewScreen(scrollEl);
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
      deployedSnapshot = null;
      renderEntrySelect();
      renderEditor();
      renderPreview();
      updateDirtyIndicator();
      return;
    }
    defaultsDoc = VasConfig.normalizeConfig(defaultsRaw);
    const orgDoc = await fetchJson(
      `/config/orgs/${encodeURIComponent(org)}.json${bust}`
    );
    const deployedDraft = orgDoc
      ? VasConfig.mergeVasConfigs(defaultsDoc, orgDoc)
      : VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));
    deployedSnapshot = JSON.parse(JSON.stringify(deployedDraft));

    const localRaw = readLocalDraft();
    let restoredLocal = false;
    if (localRaw) {
      const localNormalized = VasConfig.normalizeConfig(localRaw);
      if (!configsEqual(localNormalized, deployedDraft)) {
        draft = localNormalized;
        restoredLocal = true;
      } else {
        draft = deployedDraft;
      }
    } else {
      draft = deployedDraft;
    }

    selectedKey = Object.keys(draft.vasTypes)[0] || null;
    tab = "types";
    els.configTabSelect.value = "types";
    renderEntrySelect();
    renderEditor();
    renderPreview();
    updateDirtyIndicator();
    if (restoredLocal) {
      const savedAt = localRaw && localRaw.savedAt;
      status(
        `Restored unsaved local changes${savedAt ? ` from ${new Date(savedAt).toLocaleString()}` : ""} — not yet deployed`,
        "info"
      );
    } else {
      status(
        `Authenticated (${org}) — ${Object.keys(draft.vasTypes).length} VAS Types, ${
          Object.keys(draft.items).length
        } Items`,
        "success"
      );
    }
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
    const syncLink = document.getElementById("syncNavLink");
    if (syncLink) syncLink.href = `/config-sync.html?org=${encodeURIComponent(org)}`;
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
    els.removeStepBtn.onclick = async () => {
      syncEditorToDraft();
      const entry = currentEntry();
      if (!entry || !selectedStepId || tab !== "types") return;
      if (!(await confirmDialog(`Remove step "${selectedStepId}"?`))) return;
      delete entry.steps[selectedStepId];
      ensureStepOrder(entry);
      selectedStepId = stepKeys(entry)[0] || null;
      renderEditor();
      renderPreview();
    };
  }

  els.previewDesktopBtn.onclick = () => setPreviewMode("desktop");
  els.previewMobileBtn.onclick = () => setPreviewMode("mobile");
  // Sync the button active-classes with the mode restored from localStorage
  // above (the Mobile button defaults to "active" in the HTML).
  els.previewDesktopBtn.classList.toggle("active", previewMode === "desktop");
  els.previewMobileBtn.classList.toggle("active", previewMode === "mobile");

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

  els.deleteKeyBtn.onclick = async () => {
    if (!selectedKey) return;
    if (!(await confirmDialog(`Remove ${selectedKey} from draft?`))) return;
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
        const raw = await promptDialog("ProvidedServiceId / VAS Type name:");
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
      const itemId = await promptDialog("ItemId to add:");
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
      persistDraftLocal();
      status("Imported into local draft (not deployed)", "success");
    } catch (err) {
      status(err.message || "Import failed", "error");
    }
    e.target.value = "";
  };
  document.getElementById("resetBtn").onclick = async () => {
    if (!(await confirmDialog("Reset draft to shared defaults?"))) return;
    if (!defaultsDoc) return status("Defaults not loaded", "error");
    draft = VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));
    selectedKey = Object.keys(draft.vasTypes)[0] || null;
    switchTab("types");
    persistDraftLocal();
    status("Draft reset to defaults", "success");
  };
  if (els.discardLocalBtn) {
    els.discardLocalBtn.onclick = async () => {
      if (!(await confirmDialog("Discard unsaved local changes and reload from the last deployed config?"))) return;
      clearLocalDraft();
      await loadDraft();
    };
  }
  document.getElementById("saveBtn").onclick = async () => {
    syncEditorToDraft();
    status("Saving to the cloud...");
    const payload = {
      version: draft.version || 1,
      updatedAt: new Date().toISOString(),
      vasTypes: draft.vasTypes,
      items: draft.items
    };
    const res = await api("save_vas_config", { org, token, config: payload });
    if (!res.success) return status(res.error || "Save failed", "error");
    deployedSnapshot = JSON.parse(JSON.stringify(VasConfig.normalizeConfig(draft)));
    persistDraftLocal();
    updateDirtyIndicator();
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
