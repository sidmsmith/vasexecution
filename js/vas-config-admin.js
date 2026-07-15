(function () {
  const VasConfig = window.VasConfig;
  let token = null;
  let org = null;
  let defaultsDoc = null;
  let draft = null;
  let tab = "types"; // types | items
  let selectedKey = null;
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
    contentList: document.getElementById("contentList"),
    secSig: document.getElementById("secSig"),
    secPhotos: document.getElementById("secPhotos"),
    secMarkup: document.getElementById("secMarkup"),
    previewHost: document.getElementById("previewHost"),
    previewNote: document.getElementById("previewNote"),
    configTabSelect: document.getElementById("configTabSelect"),
    deleteKeyBtn: document.getElementById("deleteKeyBtn"),
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
    return `<button type="button" class="btn btn-icon row-action-btn del-btn ${extraClass}" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>`;
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

  function nid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureEntry(key) {
    if (!draft[bucket()][key]) {
      draft[bucket()][key] = VasConfig.normalizeEntry(
        {
          title: key,
          description: key,
          content: [],
          instructions: [],
          images: [],
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

  function readContentFromDom(keepEmpty) {
    return Array.from(els.contentList.querySelectorAll(".content-row")).map(
      (row) => {
        const type = row.dataset.type === "image" ? "image" : "text";
        if (type === "image") {
          return {
            id: row.dataset.id || nid("img"),
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
          id: row.dataset.id || nid("ins"),
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
          )
        };
      }
    ).filter((b) => {
      if (keepEmpty) return true;
      return b.type === "image" ? !!b.url : !!String(b.text || "").trim();
    });
  }

  function syncEditorToDraft() {
    const entry = currentEntry();
    if (!entry || els.editor.style.display === "none") return;
    entry.title = els.edTitle.value.trim() || selectedKey;
    entry.description = els.edDescription.value.trim() || entry.title;
    entry.content = readContentFromDom(false);
    const legacy = VasConfig.contentToLegacy(entry.content);
    entry.instructions = legacy.instructions;
    entry.images = legacy.images;
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

  function bindContentDrag() {
    const listEl = els.contentList;
    if (!listEl) return;
    let dragFrom = null;
    listEl.querySelectorAll(".content-row").forEach((item) => {
      const grip = item.querySelector(".grip");
      if (!grip) return;
      grip.draggable = true;
      grip.addEventListener("dragstart", (e) => {
        dragFrom = +item.dataset.idx;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragFrom));
        e.stopPropagation();
      });
      grip.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        listEl
          .querySelectorAll(".content-row")
          .forEach((i) => i.classList.remove("drag-over"));
        dragFrom = null;
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.classList.add("drag-over");
      });
      item.addEventListener("dragleave", (e) => {
        if (!item.contains(e.relatedTarget)) item.classList.remove("drag-over");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove("drag-over");
        const to = +item.dataset.idx;
        const entry = currentEntry();
        if (!entry || dragFrom == null || dragFrom === to) return;
        const next = readContentFromDom(true);
        const [moved] = next.splice(dragFrom, 1);
        next.splice(to, 0, moved);
        entry.content = next;
        const legacy = VasConfig.contentToLegacy(
          next.filter((b) =>
            b.type === "image" ? !!b.url : !!String(b.text || "").trim()
          )
        );
        entry.instructions = legacy.instructions;
        entry.images = legacy.images;
        entry.title = els.edTitle.value.trim() || selectedKey;
        entry.description = els.edDescription.value.trim() || entry.title;
        renderEditor();
        renderPreview();
      });
    });
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
      els.deleteKeyBtn.disabled = true;
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
    const content = entry.content || [];
    els.contentList.innerHTML = content
      .map((block, idx) => {
        if (block.type === "image") {
          const scale = VasConfig.normalizeImageScale(block.scale);
          return `<div class="content-row image-row draggable-item" data-idx="${idx}" data-type="image" data-id="${esc(
            block.id
          )}">
            <span class="grip" title="Drag to reorder" aria-label="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <div class="content-fields">
              <div class="text-format-bar image-scale-bar">
                <span class="content-type-badge"><i class="fa-solid fa-image"></i> Image</span>
                <label class="img-scale-label">
                  Size
                  <input type="range" class="img-scale" min="0" max="200" step="1" value="${scale}" aria-label="Image size percent" />
                  <span class="img-scale-value">${scale}%</span>
                </label>
              </div>
              <input class="form-control img-url" placeholder="Image URL" value="${esc(block.url)}" />
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
        return `<div class="content-row instruction-row draggable-item" data-idx="${idx}" data-type="text" data-id="${esc(
          block.id
        )}">
            <span class="grip" title="Drag to reorder" aria-label="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <div class="content-fields">
              <div class="text-format-bar">
                <span class="content-type-badge"><i class="fa-solid fa-align-left"></i> Text</span>
                <button type="button" class="fmt-btn fmt-bold${block.bold ? " active" : ""}" title="Bold" aria-label="Bold"><b>B</b></button>
                <button type="button" class="fmt-btn fmt-italic${block.italic ? " active" : ""}" title="Italic" aria-label="Italic"><i>I</i></button>
                <button type="button" class="fmt-btn fmt-underline${block.underline ? " active" : ""}" title="Underline" aria-label="Underline"><u>U</u></button>
                <label class="fmt-color-wrap" title="Text color">
                  <input type="color" class="fmt-color" value="${esc(color)}" aria-label="Text color" />
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
      })
      .join("");
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
          syncEditorToDraft();
          renderPreview();
        };
      });
    bindContentDrag();

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
    const contentHtml = (entry.content || [])
      .map((block) => {
        if (block.type === "image") {
          const imgStyle = VasConfig.imageBlockStyle(block);
          return `<div class="vas-content-image">
            <button type="button" class="vas-content-image-btn" data-image-url="${esc(
              block.url
            )}" data-image-caption="${esc(block.caption || "")}" title="Open">
              <img src="${esc(block.url)}" alt="" style="${esc(
                imgStyle
              )}" onerror="this.closest('.vas-content-image')?.remove()"/>
            </button>
            ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ""}
          </div>`;
        }
        const style = VasConfig.textBlockStyle(block);
        return `<div class="vas-content-text"${
          style ? ` style="${esc(style)}"` : ""
        }>${esc(block.text)}</div>`;
      })
      .join("");
    return `
      <article class="service-card">
        <div class="service-title">${esc(entry.title)}</div>
        <div class="service-meta mb-2">${esc(entry.description || "")}</div>
        <div class="vas-config-block ${tab === "items" ? "item-block" : "type-block"}">
          <h4>${tab === "types" ? "VAS Type" : "Item"} instructions</h4>
          ${contentHtml ? `<div class="vas-content-list">${contentHtml}</div>` : "<p class='text-muted'>No content</p>"}
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
    if (els.previewNote) {
      els.previewNote.textContent =
        previewMode === "mobile"
          ? "Theme gear applies inside the phone frame"
          : "Theme gear applies to the fullscreen preview";
    }
    renderPreview();
  }

  function renderPreview() {
    syncEditorToDraft();
    const entry = currentEntry();
    if (!entry) {
      previewThemeScope = null;
      previewDeviceLogo = null;
      els.previewHost.innerHTML =
        '<p class="text-muted mb-0">Select a VAS Type or Item to preview.</p>';
      return;
    }
    const typeCfg = tab === "types" ? entry : null;
    const itemCfg = tab === "items" ? entry : null;
    const sections = VasConfig.mergedSections(typeCfg, itemCfg);
    const cardHtml = buildCardHtml(entry, sections);
    const chrome = `
      <div class="device-app-chrome">
        <span class="device-chrome-icon" aria-hidden="true"><i class="fas fa-tags"></i></span>
        <div class="device-chrome-center">
          <img id="previewDeviceLogo" class="device-theme-logo" alt="" />
          <div class="device-chrome-title">VAS Execution</div>
        </div>
        <span class="device-chrome-icon device-chrome-spacer" aria-hidden="true"></span>
      </div>`;

    if (previewMode === "desktop") {
      els.previewHost.innerHTML = `
        <p class="preview-interactive-hint">Fullscreen preview — theme applies to this surface</p>
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
        <p class="preview-interactive-hint">Moto G4 · 360×640 — theme applies inside the phone frame</p>
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

  function switchTab(next) {
    syncEditorToDraft();
    tab = next === "items" ? "items" : "types";
    els.configTabSelect.value = tab;
    const keys = Object.keys(draft?.[bucket()] || {});
    selectedKey = keys[0] || null;
    renderEntrySelect();
    renderEditor();
    renderPreview();
  }

  els.configTabSelect.onchange = () => switchTab(els.configTabSelect.value);

  els.entrySelect.onchange = () => {
    syncEditorToDraft();
    selectedKey = els.entrySelect.value || null;
    els.deleteKeyBtn.disabled = !selectedKey;
    renderEditor();
    renderPreview();
  };

  els.previewDesktopBtn.onclick = () => setPreviewMode("desktop");
  els.previewMobileBtn.onclick = () => setPreviewMode("mobile");

  document.getElementById("addInstrBtn").onclick = () => {
    syncEditorToDraft();
    const entry = currentEntry();
    if (!entry) return;
    if (!Array.isArray(entry.content)) entry.content = [];
    entry.content.push({
      id: nid("ins"),
      type: "text",
      text: "",
      bold: false,
      italic: false,
      underline: false,
      color: VasConfig.DEFAULT_TEXT_COLOR,
      fontSize: 100
    });
    renderEditor();
    renderPreview();
  };
  document.getElementById("addImageBtn").onclick = () => {
    syncEditorToDraft();
    const entry = currentEntry();
    if (!entry) return;
    if (!Array.isArray(entry.content)) entry.content = [];
    entry.content.push({
      id: nid("img"),
      type: "image",
      url: "",
      caption: "",
      scale: 100
    });
    renderEditor();
    renderPreview();
  };
  ["secSig", "secPhotos", "secMarkup", "edTitle", "edDescription"].forEach((id) => {
    const el = document.getElementById(id);
    el.onchange = el.oninput = () => {
      syncEditorToDraft();
      renderPreview();
    };
  });

  els.deleteKeyBtn.onclick = () => {
    if (!selectedKey) return;
    if (!confirm(`Remove ${selectedKey} from draft?`)) return;
    delete draft[bucket()][selectedKey];
    selectedKey = Object.keys(draft[bucket()])[0] || null;
    renderEntrySelect();
    renderEditor();
    renderPreview();
  };

  document.getElementById("addItemBtn").onclick = () => {
    const itemId = prompt("ItemId to add:");
    if (!itemId || !itemId.trim()) return;
    switchTab("items");
    selectedKey = itemId.trim();
    ensureEntry(selectedKey);
    renderEntrySelect();
    renderEditor();
    renderPreview();
  };

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
