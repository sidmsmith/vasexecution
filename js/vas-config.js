/** VAS Execution config load/merge — defaults + per-org overlay. */
(function (global) {
  const DEFAULT_SECTIONS = {
    signature: { enabled: false, required: false, label: "Operator Signature" },
    photos: { enabled: false, required: false, label: "Miscellaneous Photos" },
    markupPad: { enabled: false, required: false, label: "Markup Pad", mode: "photo" }
  };

  function emptyConfig() {
    return { version: 1, vasTypes: {}, items: {} };
  }

  function nid(prefix, i) {
    return `${prefix}_${i}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeSections(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      signature: {
        ...DEFAULT_SECTIONS.signature,
        ...(src.signature || {})
      },
      photos: {
        ...DEFAULT_SECTIONS.photos,
        ...(src.photos || {})
      },
      markupPad: {
        ...DEFAULT_SECTIONS.markupPad,
        ...(src.markupPad || {}),
        mode: (src.markupPad && src.markupPad.mode) || "photo"
      }
    };
  }

  const DEFAULT_TEXT_COLOR = "#000000";

  function sanitizeColor(value) {
    const v = String(value || "").trim();
    if (/^#[0-9a-fA-F]{3}$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v)) return v;
    return "";
  }

  function normalizeImageScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.max(0, Math.min(200, Math.round(n)));
  }

  /** Text size % relative to base; slider 50–150 with 100 in the middle. */
  function normalizeFontSize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.max(50, Math.min(150, Math.round(n)));
  }

  function normalizeContentBlock(raw, i) {
    if (!raw || typeof raw !== "object") return null;
    const type = raw.type === "image" ? "image" : "text";
    if (type === "image") {
      const url = String(raw.url || "").trim();
      if (!url) return null;
      return {
        id: raw.id || `img_${i}`,
        type: "image",
        url,
        caption: String(raw.caption || "").trim(),
        scale: normalizeImageScale(raw.scale)
      };
    }
    const text = String(raw.text || raw.InstructionText || "").trim();
    if (!text) return null;
    return {
      id: raw.id || `ins_${i}`,
      type: "text",
      text,
      bold: !!raw.bold,
      italic: !!raw.italic,
      underline: !!raw.underline,
      color: sanitizeColor(raw.color) || DEFAULT_TEXT_COLOR,
      fontSize: normalizeFontSize(raw.fontSize)
    };
  }

  /** Inline style attrs for a formatted text block (escaped separately by caller). */
  function textBlockStyle(block) {
    if (!block || block.type === "image") return "";
    const parts = [];
    const fontSize = normalizeFontSize(block.fontSize);
    parts.push(`font-size:${fontSize}%`);
    if (block.bold) parts.push("font-weight:700");
    if (block.italic) parts.push("font-style:italic");
    if (block.underline) parts.push("text-decoration:underline");
    parts.push(`color:${sanitizeColor(block.color) || DEFAULT_TEXT_COLOR}`);
    return parts.join(";");
  }

  function imageBlockStyle(block) {
    if (!block || block.type !== "image") return "";
    const scale = normalizeImageScale(block.scale);
    return `width:${scale}%; max-width:${scale}%; height:auto;`;
  }

  const PDF_PLACEHOLDER_URL = "/assets/icons/vas-pdf-placeholder.svg";

  function isPdfUrl(url) {
    const s = String(url || "").trim();
    if (!s) return false;
    try {
      return /\.pdf$/i.test(new URL(s, "https://example.invalid").pathname);
    } catch {
      return /\.pdf(\?|#|$)/i.test(s);
    }
  }

  function isCloudinaryDeliveryUrl(url) {
    try {
      return /cloudinary/i.test(new URL(url).hostname);
    } catch {
      return /cloudinary/i.test(String(url || ""));
    }
  }

  /**
   * Cloudinary: deliver PDF page 1 as a JPG preview.
   * Example: .../image/upload/v1/doc.pdf → .../image/upload/f_jpg,pg_1,q_auto/v1/doc.jpg
   */
  function cloudinaryPdfPreviewUrl(url) {
    try {
      const u = new URL(url);
      if (!isCloudinaryDeliveryUrl(u.href)) return null;
      const path = u.pathname;
      if (/\/raw\/upload\//i.test(path)) return null;
      const marker = "/image/upload/";
      const idx = path.toLowerCase().indexOf(marker);
      if (idx < 0) return null;
      if (!/\.pdf$/i.test(path)) return null;

      const before = path.slice(0, idx + marker.length);
      let after = path.slice(idx + marker.length).replace(/\.pdf$/i, "");
      if (!after) return null;
      if (!/(^|\/)f_jpg(,|\/|$)/i.test(after)) {
        after = `f_jpg,pg_1,q_auto/${after}`;
      } else if (!/(^|\/|,)pg_\d+(,|\/|$)/i.test(after)) {
        after = after.replace(/(^|\/)f_jpg(?=,|\/|$)/i, "$1f_jpg,pg_1");
      }
      u.pathname = `${before}${after}.jpg`;
      return u.toString();
    } catch {
      return null;
    }
  }

  /** Resolve display vs open URLs for content image blocks (supports Cloudinary PDFs). */
  function contentImageUrls(blockOrUrl) {
    const openUrl = String(
      typeof blockOrUrl === "string"
        ? blockOrUrl
        : (blockOrUrl && blockOrUrl.url) || ""
    ).trim();
    if (!openUrl) {
      return { openUrl: "", displayUrl: "", isPdf: false };
    }
    if (!isPdfUrl(openUrl)) {
      return { openUrl, displayUrl: openUrl, isPdf: false };
    }
    const preview =
      (isCloudinaryDeliveryUrl(openUrl) && cloudinaryPdfPreviewUrl(openUrl)) ||
      "";
    return {
      openUrl,
      displayUrl: preview || PDF_PLACEHOLDER_URL,
      isPdf: true
    };
  }

  /** Shared HTML for execution + admin preview content images. */
  function renderContentImageHtml(block, escFn) {
    const esc =
      typeof escFn === "function"
        ? escFn
        : (s) =>
            String(s ?? "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
    const { openUrl, displayUrl, isPdf } = contentImageUrls(block);
    if (!openUrl || !displayUrl) return "";
    const imgStyle = imageBlockStyle(block);
    const caption = String((block && block.caption) || "").trim();
    const title = isPdf ? "Open PDF" : "Open";
    const onError = isPdf
      ? `if(!this.dataset.fb){this.dataset.fb='1';this.src='${PDF_PLACEHOLDER_URL}';}else{this.closest('.vas-content-image')?.remove();}`
      : "this.closest('.vas-content-image')?.remove()";
    return `<div class="vas-content-image${isPdf ? " is-pdf" : ""}">
      <button type="button" class="vas-content-image-btn" data-image-url="${esc(
        displayUrl
      )}" data-open-url="${esc(openUrl)}" data-media-kind="${
      isPdf ? "pdf" : "image"
    }" data-image-caption="${esc(caption)}" title="${esc(title)}">
        ${isPdf ? '<span class="vas-pdf-badge">PDF</span>' : ""}
        <img src="${esc(displayUrl)}" alt="${esc(caption)}" loading="lazy"
          style="${esc(imgStyle)}"
          onerror="${onError}" />
      </button>
      ${caption ? `<div class="caption">${esc(caption)}</div>` : ""}
    </div>`;
  }

  /** Prefer content[]; migrate legacy instructions + images. */
  function normalizeContent(src) {
    if (Array.isArray(src.content) && src.content.length) {
      return src.content.map(normalizeContentBlock).filter(Boolean);
    }
    const blocks = [];
    if (Array.isArray(src.instructions)) {
      src.instructions.forEach((x, i) => {
        const b = normalizeContentBlock(
          {
            type: "text",
            id: x && x.id,
            text: x && (x.text || x.InstructionText),
            bold: x && x.bold,
            italic: x && x.italic,
            underline: x && x.underline,
            color: x && x.color,
            fontSize: x && x.fontSize
          },
          i
        );
        if (b) blocks.push(b);
      });
    }
    if (Array.isArray(src.images)) {
      src.images.forEach((x, i) => {
        const b = normalizeContentBlock(
          {
            type: "image",
            id: x && x.id,
            url: x && x.url,
            caption: x && x.caption,
            scale: x && x.scale
          },
          blocks.length + i
        );
        if (b) blocks.push(b);
      });
    }
    return blocks;
  }

  function contentToLegacy(content) {
    const instructions = [];
    const images = [];
    (content || []).forEach((b) => {
      if (b.type === "image") {
        images.push({
          id: b.id,
          url: b.url,
          caption: b.caption || "",
          scale: normalizeImageScale(b.scale)
        });
      } else {
        instructions.push({
          id: b.id,
          text: b.text,
          bold: !!b.bold,
          italic: !!b.italic,
          underline: !!b.underline,
          color: sanitizeColor(b.color) || DEFAULT_TEXT_COLOR,
          fontSize: normalizeFontSize(b.fontSize)
        });
      }
    });
    return { instructions, images };
  }

  const DEFAULT_TYPE_ICON_URL = "/assets/icons/vas-type-default.svg";

  function normalizeIconUrl(value) {
    const url = String(value || "").trim();
    return url;
  }

  /** Resolved icon for a VAS Type (configured URL or shared default). */
  function typeIconUrl(typeCfg) {
    const url = normalizeIconUrl(typeCfg && typeCfg.iconUrl);
    return url || DEFAULT_TYPE_ICON_URL;
  }

  function normalizeStepEntry(raw, stepId) {
    const src = raw && typeof raw === "object" ? raw : {};
    const content = normalizeContent(src);
    return {
      title: String(src.title || stepId || "").trim() || String(stepId || ""),
      content,
      layout: normalizeLayout(src.layout, content)
    };
  }

  const MAX_STEP_COLUMNS = 3;

  function normalizeColumnWidth(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.max(1, Math.min(4, Math.round(n)));
  }

  /**
   * Step layout: up to 3 columns of block ids.
   * Missing layout → one column with all content ids (backward compatible).
   * Drops unknown ids; orphans append to column 1.
   */
  function normalizeLayout(rawLayout, content) {
    const blocks = Array.isArray(content) ? content : [];
    const allIds = blocks.map((b) => String(b && b.id || "").trim()).filter(Boolean);
    const idSet = new Set(allIds);
    const src = rawLayout && typeof rawLayout === "object" ? rawLayout : {};
    const rawCols = Array.isArray(src.columns) ? src.columns : [];

    const columns = [];
    rawCols.slice(0, MAX_STEP_COLUMNS).forEach((col, i) => {
      if (!col || typeof col !== "object") return;
      const blockIds = Array.isArray(col.blockIds)
        ? col.blockIds.map((id) => String(id || "").trim()).filter((id) => idSet.has(id))
        : [];
      columns.push({
        id: String(col.id || `col_${i}`).trim() || `col_${i}`,
        width: normalizeColumnWidth(col.width),
        blockIds
      });
    });

    if (!columns.length) {
      columns.push({ id: "col_0", width: 1, blockIds: allIds.slice() });
    }

    const seen = new Set();
    columns.forEach((col) => {
      col.blockIds = col.blockIds.filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    });

    allIds.forEach((id) => {
      if (!seen.has(id)) {
        columns[0].blockIds.push(id);
        seen.add(id);
      }
    });

    return { columns };
  }

  function defaultEsc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderContentBlockHtml(block, escFn) {
    const esc = typeof escFn === "function" ? escFn : defaultEsc;
    if (!block) return "";
    if (block.type === "image") {
      return renderContentImageHtml(block, esc);
    }
    const style = textBlockStyle(block);
    return `<div class="vas-content-text"${
      style ? ` style="${esc(style)}"` : ""
    }>${esc(block.text)}</div>`;
  }

  function renderContentListHtml(blocks, escFn) {
    const list = (blocks || []).filter(Boolean);
    if (!list.length) return "";
    return `<div class="vas-content-list">${list
      .map((b) => renderContentBlockHtml(b, escFn))
      .join("")}</div>`;
  }

  /**
   * Render step content with optional multi-column layout.
   * Single column (or no layout) → stacked .vas-content-list (mobile-friendly default).
   */
  function renderStepContentHtml(stepCfg, escFn) {
    if (!stepHasContent(stepCfg)) return "";
    const content = stepCfg.content || [];
    const byId = {};
    content.forEach((b) => {
      if (b && b.id) byId[b.id] = b;
    });
    const layout = normalizeLayout(stepCfg.layout, content);
    const cols = layout.columns || [];

    if (cols.length <= 1) {
      const order = cols[0] ? cols[0].blockIds : content.map((b) => b.id);
      const blocks = order.map((id) => byId[id]).filter(Boolean);
      return renderContentListHtml(blocks.length ? blocks : content, escFn);
    }

    const template = cols.map((c) => `${normalizeColumnWidth(c.width)}fr`).join(" ");
    const colHtml = cols
      .map((col) => {
        const blocks = (col.blockIds || []).map((id) => byId[id]).filter(Boolean);
        return `<div class="vas-content-column" data-col-id="${defaultEsc(col.id)}">${
          renderContentListHtml(blocks, escFn) ||
          '<div class="vas-content-list vas-content-list--empty"></div>'
        }</div>`;
      })
      .join("");
    return `<div class="vas-content-columns" style="grid-template-columns:${template}">${colHtml}</div>`;
  }

  /** steps keyed by AssignedServiceStepId. */
  function normalizeSteps(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    Object.keys(src).forEach((key) => {
      const id = String(key || "").trim();
      if (!id) return;
      out[id] = normalizeStepEntry(src[key], id);
    });
    return out;
  }

  function normalizeEntry(raw, fallbackTitle) {
    const src = raw && typeof raw === "object" ? raw : {};
    const content = normalizeContent(src);
    const legacy = contentToLegacy(content);
    return {
      title: src.title || fallbackTitle || "",
      description: src.description || src.title || fallbackTitle || "",
      iconUrl: normalizeIconUrl(src.iconUrl),
      content,
      instructions: legacy.instructions,
      images: legacy.images,
      steps: normalizeSteps(src.steps),
      sections: normalizeSections(src.sections)
    };
  }

  function normalizeConfig(doc) {
    const out = emptyConfig();
    if (!doc || typeof doc !== "object") return out;
    out.version = doc.version || 1;
    const types = doc.vasTypes || {};
    Object.keys(types).forEach((key) => {
      out.vasTypes[key] = normalizeEntry(types[key], key);
    });
    const items = doc.items || {};
    Object.keys(items).forEach((key) => {
      out.items[key] = normalizeEntry(items[key], key);
    });
    return out;
  }

  function mergeVasConfigs(defaultsDoc, orgDoc) {
    const base = normalizeConfig(defaultsDoc);
    if (!orgDoc || typeof orgDoc !== "object") return base;
    const orgTypes = orgDoc.vasTypes || {};
    Object.keys(orgTypes).forEach((key) => {
      base.vasTypes[key] = normalizeEntry(orgTypes[key], key);
    });
    const orgItems = orgDoc.items || {};
    Object.keys(orgItems).forEach((key) => {
      base.items[key] = normalizeEntry(orgItems[key], key);
    });
    if (orgDoc.version) base.version = orgDoc.version;
    return base;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function loadVasConfigForOrg(org) {
    const bust = `?t=${Date.now()}`;
    let defaults =
      (await fetchJson(`/config/vas.default.json${bust}`)) ||
      (await fetchJson(`/config/vas.json${bust}`));
    defaults = normalizeConfig(defaults);
    const orgKey = String(org || "").trim().toUpperCase();
    if (!orgKey) return defaults;
    const orgDoc = await fetchJson(
      `/config/orgs/${encodeURIComponent(orgKey)}.json${bust}`
    );
    if (!orgDoc) return defaults;
    return mergeVasConfigs(defaults, orgDoc);
  }

  function getTypeConfig(config, providedServiceId) {
    if (!config || !providedServiceId) return null;
    return config.vasTypes[providedServiceId] || null;
  }

  function getItemConfig(config, itemId) {
    if (!config || !itemId) return null;
    return config.items[String(itemId)] || null;
  }

  /** Step config under a VAS Type; key = AssignedServiceStepId. */
  function getStepConfig(typeCfg, assignedServiceStepId) {
    if (!typeCfg || !assignedServiceStepId) return null;
    const steps = typeCfg.steps || {};
    return steps[String(assignedServiceStepId)] || null;
  }

  /** True when step has at least one usable content block. */
  function stepHasContent(stepCfg) {
    if (!stepCfg || !Array.isArray(stepCfg.content)) return false;
    return stepCfg.content.some((b) => {
      if (!b) return false;
      if (b.type === "image") return !!String(b.url || "").trim();
      return !!String(b.text || "").trim();
    });
  }

  /** OR-merge section enabled flags from type + item (show both content; shared capture). */
  function mergedSections(typeCfg, itemCfg) {
    const a = normalizeSections(typeCfg && typeCfg.sections);
    const b = normalizeSections(itemCfg && itemCfg.sections);
    return {
      signature: {
        ...a.signature,
        enabled: !!(a.signature.enabled || b.signature.enabled),
        required: !!(a.signature.required || b.signature.required),
        label: a.signature.enabled
          ? a.signature.label
          : b.signature.enabled
            ? b.signature.label
            : a.signature.label
      },
      photos: {
        ...a.photos,
        enabled: !!(a.photos.enabled || b.photos.enabled),
        required: !!(a.photos.required || b.photos.required),
        label: a.photos.enabled
          ? a.photos.label
          : b.photos.enabled
            ? b.photos.label
            : a.photos.label
      },
      markupPad: {
        ...a.markupPad,
        enabled: !!(a.markupPad.enabled || b.markupPad.enabled),
        required: !!(a.markupPad.required || b.markupPad.required),
        mode: a.markupPad.mode || b.markupPad.mode || "photo",
        label: a.markupPad.enabled
          ? a.markupPad.label
          : b.markupPad.enabled
            ? b.markupPad.label
            : a.markupPad.label
      }
    };
  }

  global.VasConfig = {
    emptyConfig,
    normalizeConfig,
    normalizeEntry,
    mergeVasConfigs,
    loadVasConfigForOrg,
    getTypeConfig,
    getItemConfig,
    getStepConfig,
    stepHasContent,
    normalizeStepEntry,
    normalizeSteps,
    normalizeLayout,
    normalizeColumnWidth,
    MAX_STEP_COLUMNS,
    renderContentBlockHtml,
    renderContentListHtml,
    renderStepContentHtml,
    mergedSections,
    contentToLegacy,
    sanitizeColor,
    normalizeImageScale,
    normalizeFontSize,
    normalizeIconUrl,
    typeIconUrl,
    textBlockStyle,
    imageBlockStyle,
    isPdfUrl,
    isCloudinaryDeliveryUrl,
    cloudinaryPdfPreviewUrl,
    contentImageUrls,
    renderContentImageHtml,
    PDF_PLACEHOLDER_URL,
    DEFAULT_TEXT_COLOR,
    DEFAULT_TYPE_ICON_URL,
    DEFAULT_SECTIONS
  };
})(typeof window !== "undefined" ? window : globalThis);
