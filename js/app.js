(function () {
  const Themes = window.InspectionThemes;
  const ASSIGNED_SERVICE_STATUS = {
    "1000": "Created",
    "2000": "In Progress",
    "5000": "Complete",
    "8000": "Cancelled",
    "9000": "Failed"
  };

  let token = null;
  let org = null;
  let olpnIds = new Set();
  let olpnIdsLoaded = false;
  let currentOlpnId = null;
  let currentRequestorIds = [];
  let currentOlpnRecord = null;
  let currentItemMap = {};
  let currentServices = [];
  let vasConfig = null;
  let activeServiceIndex = 0;

  const VIEW_KEY = "vas-execution-view";
  const STEP_VIEW_KEY = "vas-step-view-mode";

  const els = {
    orgSection: document.getElementById("orgSection"),
    orgInput: document.getElementById("org"),
    orgBtn: document.getElementById("orgBtn"),
    mainUI: document.getElementById("mainUI"),
    olpnInput: document.getElementById("olpn"),
    inspectBtn: document.getElementById("inspectBtn"),
    status: document.getElementById("status"),
    results: document.getElementById("results"),
    olpnMeta: document.getElementById("olpnMeta"),
    executionBar: document.querySelector(".execution-bar"),
    serviceViews: document.getElementById("serviceViews"),
    serviceNav: document.getElementById("serviceNav"),
    serviceList: document.getElementById("serviceList"),
    viewSelect: document.getElementById("viewSelect"),
    completeSelectedBtn: document.getElementById("completeSelectedBtn"),
    completeAllBtn: document.getElementById("completeAllBtn"),
    selectAllBtn: document.getElementById("selectAllBtn"),
    busy: document.getElementById("busyOverlay"),
    busyMsg: document.getElementById("busyMessage"),
    themeBtn: document.getElementById("themeSelectorBtn"),
    themeLogo: document.getElementById("themeLogo"),
    themeList: document.getElementById("themeList"),
    cameraBtn: document.getElementById("cameraBtn"),
    cameraFileInput: document.getElementById("cameraFileInput"),
    cameraPhotoCount: document.getElementById("cameraPhotoCount")
  };

  const themeModal = els.themeList
    ? new bootstrap.Modal(document.getElementById("themeModal"))
    : null;

  function status(text, type = "info") {
    els.status.textContent = text || "";
    els.status.className = "status-bar " + type;
  }

  function setBusy(on, message) {
    if (!els.busy) return;
    if (on) {
      els.busyMsg.textContent = message || "Working...";
      els.busy.hidden = false;
    } else {
      els.busy.hidden = true;
    }
  }

  function formatAssignedStatus(statusId, statusDesc) {
    if (statusDesc && String(statusDesc).trim()) return String(statusDesc).trim();
    if (statusId == null || statusId === "") return "—";
    const key = String(statusId).trim();
    return ASSIGNED_SERVICE_STATUS[key] || key;
  }

  /** Created = red, Complete = green, everything else = amber. */
  function statusBadgeClass(statusId, statusText) {
    const id = String(statusId ?? "").trim();
    const text = String(statusText || "").trim().toLowerCase();
    if (id === "5000" || /\bcomplete/.test(text)) return "status-chip status-complete";
    if (id === "1000" || text === "created") return "status-chip status-created";
    return "status-chip status-other";
  }

  function statusBadgeHtml(statusId, statusDesc) {
    const text = formatAssignedStatus(statusId, statusDesc);
    return `<span class="badge ${statusBadgeClass(statusId, text)}">${esc(
      text
    )}</span>`;
  }

  function isValidOlpn(value) {
    const id = String(value || "").trim();
    if (!id || !token) return false;
    if (!olpnIdsLoaded) return false;
    return olpnIds.has(id);
  }

  function updateLoadButton() {
    const value = (els.olpnInput.value || "").trim();
    if (!token) {
      els.inspectBtn.disabled = true;
      els.inspectBtn.textContent = "Enter Valid oLPN";
      return;
    }
    if (!olpnIdsLoaded) {
      els.inspectBtn.disabled = true;
      els.inspectBtn.textContent = "Loading oLPNs...";
      return;
    }
    if (!value || !olpnIds.has(value)) {
      els.inspectBtn.disabled = true;
      els.inspectBtn.textContent = "Enter Valid oLPN";
      return;
    }
    els.inspectBtn.disabled = false;
    els.inspectBtn.textContent = "Load oLPN";
  }

  async function api(action, data = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`/api/${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify(data)
      });
    } catch (err) {
      return { success: false, error: err.message || "Network request failed" };
    }

    const rawText = await response.text();
    let body = null;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        return {
          success: false,
          error:
            rawText.replace(/\s+/g, " ").trim().slice(0, 160) ||
            `Request failed (HTTP ${response.status})`
        };
      }
    }
    if (!response.ok && body && body.success !== false) {
      return {
        success: false,
        error: body.error || `Request failed (HTTP ${response.status})`
      };
    }
    return body || { success: false, error: `Request failed (HTTP ${response.status})` };
  }

  function trackEvent(eventName, metadata = {}) {
    api("usage-track", {
      event_name: eventName,
      metadata: {
        org: org || null,
        theme: localStorage.getItem("selectedTheme") || "default",
        ...metadata
      }
    }).catch(() => {});
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderItemImage(url) {
    const safe = String(url || "").trim();
    if (!safe) return "";
    const candidates =
      window.VasConfig && typeof window.VasConfig.imageUrlCandidates === "function"
        ? window.VasConfig.imageUrlCandidates(safe)
        : [safe];
    const first = candidates[0] || safe;
    const candJson = esc(JSON.stringify(candidates));
    return `<span class="item-image-wrap item-image-wrap--inline" data-image-url="${esc(first)}">
      <img class="item-image-thumb" src="${esc(first)}" alt="" loading="lazy" decoding="async"
        data-img-candidates="${candJson}" data-img-candidate-idx="0"
        onerror="window.VasConfig&&window.VasConfig.advanceImageFallback(this)" />
    </span>`;
  }

  function renderContentBlocks(content) {
    if (!content || !content.length) return "";
    return `<div class="vas-content-list">${content
      .map((block) => {
        if (block.type === "image") {
          return window.VasConfig
            ? window.VasConfig.renderContentImageHtml(block, esc)
            : "";
        }
        const style = window.VasConfig
          ? window.VasConfig.textBlockStyle(block)
          : "";
        return `<div class="vas-content-text"${
          style ? ` style="${esc(style)}"` : ""
        }>${esc(block.text)}</div>`;
      })
      .join("")}</div>`;
  }

  function renderConfigBlock(kind, cfg) {
    if (!cfg) return "";
    const title =
      kind === "type"
        ? `VAS Type: ${cfg.title || ""}`
        : `Item: ${cfg.title || ""}`;
    const content = cfg.content || [];
    if (!content.length) return "";
    return `<div class="vas-config-block ${kind === "item" ? "item-block" : "type-block"}">
      <h4>${esc(title)}</h4>
      ${renderContentBlocks(content)}
    </div>`;
  }

  function renderCaptureSections(cardKey, sections) {
    if (!sections) return "";
    const parts = [];
    if (sections.signature && sections.signature.enabled) {
      parts.push(`<div class="capture-section signature-section" data-capture="signature">
        <div class="capture-section-header">
          <label>${esc(sections.signature.label || "Signature")}${
            sections.signature.required ? " *" : ""
          }</label>
          <button type="button" class="btn btn-sm btn-secondary pad-clear-btn sig-clear">Clear Signature</button>
        </div>
        <div class="signature-pad-wrapper is-empty">
          <div class="signature-pad-placeholder" aria-hidden="true">
            <i class="fa-solid fa-signature"></i>
            <span>Sign here</span>
          </div>
          <canvas class="signature-canvas" aria-label="Signature pad"></canvas>
        </div>
      </div>`);
    }
    if (sections.photos && sections.photos.enabled) {
      parts.push(`<div class="capture-section photo-capture" data-capture="photos">
        <div class="capture-section-header">
          <label>${esc(sections.photos.label || "Photos")}${
            sections.photos.required ? " *" : ""
          }</label>
        </div>
        <p class="photos-hint"><i class="fas fa-camera"></i> Use the camera icon (upper left) to add photos</p>
        <div class="photo-strip"></div>
      </div>`);
    }
    if (sections.markupPad && sections.markupPad.enabled) {
      parts.push(`<div class="capture-section damage-pad-section" data-capture="markup">
        <div class="capture-section-header damage-pad-header">
          <label>${esc(sections.markupPad.label || "Markup Pad")}${
            sections.markupPad.required ? " *" : ""
          }</label>
          <div class="damage-pad-controls">
            <button type="button" class="btn btn-sm btn-secondary damage-pad-photo-btn markup-camera" title="Add photo">
              <i class="fas fa-camera"></i>
            </button>
            <button type="button" class="btn btn-sm btn-secondary pad-clear-btn clear-photo-btn markup-clear-photo" style="display:none">Clear Photo</button>
            <button type="button" class="btn btn-sm btn-secondary pad-clear-btn clear-marks-btn markup-clear">Clear Marks</button>
          </div>
        </div>
        <div class="damage-pad-wrapper markup-pad is-empty show-empty-placeholder" data-card="${esc(cardKey)}">
          <div class="damage-pad-empty-placeholder" aria-hidden="true">
            <i class="fa-solid fa-plus"></i>
          </div>
          <canvas class="markup-bg"></canvas>
          <canvas class="markup-draw"></canvas>
        </div>
        <input type="file" class="markup-file" accept="image/*" capture="environment" hidden />
      </div>`);
    }
    if (!parts.length) return "";
    return `<div class="capture-sections">${parts.join("")}</div>`;
  }

  function syncCameraBtn() {
    const anyPhotos = !!els.serviceList.querySelector(
      ".capture-section[data-capture='photos']"
    );
    if (window.VasPads) {
      window.VasPads.setCameraVisible(els.cameraBtn, anyPhotos);
    }
  }

  function stepRemaining(step) {
    const n = Number(step?.RemainingQuantity);
    return Number.isFinite(n) ? n : 0;
  }

  function serviceKey(svc, step) {
    return [
      String(svc.ServiceRequestorId || ""),
      String(svc.ProvidedServiceId || ""),
      String(step.AssignedServiceStepId || "")
    ].join("|");
  }

  function openSteps(services) {
    const rows = [];
    (services || []).forEach((svc) => {
      (svc.AssignedServiceStep || []).forEach((step) => {
        if (stepRemaining(step) > 0) rows.push({ svc, step });
      });
    });
    return rows;
  }

  function getPreferredView() {
    return localStorage.getItem(VIEW_KEY) === "1" ? "1" : "2";
  }

  function setPreferredView(value) {
    if (value === "1" || value === "2") {
      localStorage.setItem(VIEW_KEY, value);
    }
  }

  /** Layout 6: interleaved (2b) | active (3). */
  function getPreferredStepView() {
    return localStorage.getItem(STEP_VIEW_KEY) === "active"
      ? "active"
      : "interleaved";
  }

  function setPreferredStepView(value) {
    if (value === "active" || value === "interleaved") {
      localStorage.setItem(STEP_VIEW_KEY, value);
    }
  }

  /** Main/detail only when 2+ provided services and user prefers view 1. */
  function effectiveIsMainDetail() {
    return currentServices.length > 1 && getPreferredView() === "1";
  }

  function setActiveService(index) {
    const cards = els.serviceList
      ? Array.from(els.serviceList.querySelectorAll(".service-card"))
      : [];
    if (!cards.length) {
      activeServiceIndex = 0;
      return;
    }
    const next = Math.max(0, Math.min(index, cards.length - 1));
    activeServiceIndex = next;
    cards.forEach((card, i) => {
      card.classList.toggle("is-active-service", i === next);
    });
    if (els.serviceNav) {
      els.serviceNav.querySelectorAll(".line-nav-item").forEach((btn, i) => {
        btn.classList.toggle("active", i === next);
      });
    }
  }

  function renderServiceNav() {
    if (!els.serviceNav) return;
    if (!currentServices.length) {
      els.serviceNav.innerHTML = "";
      return;
    }
    els.serviceNav.innerHTML = currentServices
      .map((svc, i) => {
        const openCount = (svc.AssignedServiceStep || []).filter(
          (s) => stepRemaining(s) > 0
        ).length;
        const statusText = formatAssignedStatus(
          svc.StatusId,
          svc.AssignedServiceStatusDesc
        );
        const metaParts = [];
        if (svc.ItemId) metaParts.push(String(svc.ItemId));
        else if (svc.IsOlpnLevel) metaParts.push("oLPN-level");
        metaParts.push(`${openCount} open`);
        metaParts.push(statusText);
        const typeCfg = window.VasConfig
          ? window.VasConfig.getTypeConfig(vasConfig, svc.ProvidedServiceId)
          : null;
        const iconUrl = window.VasConfig
          ? window.VasConfig.typeIconUrl(typeCfg)
          : "";
        const iconHtml = iconUrl
          ? `<img class="nav-service-icon" src="${esc(
              iconUrl
            )}" alt="" onerror="this.remove()" />`
          : "";
        return `<button type="button" class="line-nav-item line-nav-item--with-icon" data-service-index="${i}">
          <div class="nav-service-text">
            <div class="nav-service-title">${i + 1}. ${esc(
              svc.ProvidedServiceId || "Service"
            )}</div>
            <div class="nav-service-meta">${esc(metaParts.join(" · "))}</div>
          </div>
          ${iconHtml}
        </button>`;
      })
      .join("");
    els.serviceNav.querySelectorAll(".line-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveService(Number(btn.dataset.serviceIndex) || 0);
      });
    });
  }

  function applyAppTitle() {
    const titleEl = document.querySelector(".app-title");
    if (!titleEl) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    titleEl.textContent = isMobile ? "VAS Execution" : "VAS Workbench";
  }

  function applyViewMode() {
    const preferred = getPreferredView();
    const multi = currentServices.length > 1;
    if (els.viewSelect) {
      els.viewSelect.value = preferred;
      els.viewSelect.disabled = !multi;
      if (!multi) {
        els.viewSelect.title =
          "Main / detail is available when there are multiple provided services";
      } else {
        els.viewSelect.title = "";
      }
    }
    const main = effectiveIsMainDetail();
    if (els.serviceViews) {
      els.serviceViews.classList.toggle("main-detail-active", main);
      els.serviceViews.classList.toggle("stacked-active", !main);
    }
    applyAppTitle();
    if (main) {
      renderServiceNav();
      setActiveService(activeServiceIndex);
    } else {
      els.serviceList
        ?.querySelectorAll(".service-card")
        .forEach((card) => card.classList.add("is-active-service"));
      if (els.serviceNav) els.serviceNav.innerHTML = "";
    }
  }

  function openStepCheckboxes(card) {
    return Array.from(
      (card || els.serviceList).querySelectorAll(".step-select:not(:disabled)")
    );
  }

  function syncServiceCheckbox(card) {
    const serviceCb = card.querySelector(".service-select");
    if (!serviceCb || serviceCb.disabled) return;
    const steps = openStepCheckboxes(card);
    if (!steps.length) {
      serviceCb.checked = false;
      serviceCb.indeterminate = false;
      return;
    }
    const selectedCount = steps.filter((cb) => cb.checked).length;
    serviceCb.checked = selectedCount === steps.length;
    serviceCb.indeterminate = selectedCount > 0 && selectedCount < steps.length;
  }

  function setCardStepsSelected(card, selected) {
    openStepCheckboxes(card).forEach((cb) => {
      cb.checked = !!selected;
    });
    syncServiceCheckbox(card);
  }

  function updateExecutionButtons() {
    const open = openSteps(currentServices);
    const selected = openStepCheckboxes().filter((cb) => cb.checked);
    els.completeAllBtn.disabled = open.length === 0;
    els.completeSelectedBtn.disabled = selected.length === 0;
  }

  function validateQtyInput(input) {
    const max = Number(input.dataset.remaining || 0);
    let value = Number(input.value);
    input.classList.remove("is-invalid");
    if (!Number.isFinite(value) || value <= 0) {
      input.classList.add("is-invalid");
      return { ok: false, error: "Quantity must be greater than 0" };
    }
    if (value > max) {
      input.classList.add("is-invalid");
      return {
        ok: false,
        error: `Quantity cannot exceed remaining quantity (${max})`
      };
    }
    return { ok: true, value };
  }

  function collectCompletions(mode) {
    const completions = [];
    const errors = [];
    const cards = els.serviceList.querySelectorAll(".service-card");
    cards.forEach((card) => {
      card.querySelectorAll(".qty-input").forEach((input) => {
        const remaining = Number(input.dataset.remaining || 0);
        if (remaining <= 0) return;
        const row = input.closest("tr");
        const stepChecked = row?.querySelector(".step-select")?.checked;
        if (mode === "selected" && !stepChecked) return;
        const check = validateQtyInput(input);
        if (!check.ok) {
          errors.push(
            `${input.dataset.providedServiceId} / ${input.dataset.stepId}: ${check.error}`
          );
          return;
        }
        completions.push({
          ServiceRequestorId: input.dataset.requestorId,
          ProvidedServiceId: input.dataset.providedServiceId,
          AssignedServiceStepId: input.dataset.stepId,
          quantity: check.value
        });
      });
    });
    return { completions, errors };
  }

  function stepTableHeadHtml() {
    return `<colgroup>
        <col class="col-select" />
        <col class="col-step" />
        <col class="col-desc" />
        <col class="col-num" />
        <col class="col-num" />
        <col class="col-num" />
        <col class="col-qty" />
        <col class="col-status" />
      </colgroup>
      <thead>
      <tr>
        <th class="step-select-col" aria-label="Select step"></th>
        <th>Step</th>
        <th>Description</th>
        <th class="step-num">Requested</th>
        <th class="step-num">Remaining</th>
        <th class="step-num">Completed</th>
        <th class="step-qty">Qty to complete</th>
        <th class="step-status">Status</th>
      </tr>
    </thead>`;
  }

  function stepRowCellsHtml(svc, step) {
    const remaining = stepRemaining(step);
    const selectControl =
      remaining > 0
        ? `<input type="checkbox" class="step-select" aria-label="Select step ${esc(
            step.AssignedServiceStepId || ""
          )}" />`
        : `<span class="text-muted">—</span>`;
    const qtyControl =
      remaining > 0
        ? `<input type="number" class="form-control qty-input" min="0.0001" step="any"
            value="${esc(remaining)}"
            data-remaining="${esc(remaining)}"
            data-requestor-id="${esc(svc.ServiceRequestorId)}"
            data-provided-service-id="${esc(svc.ProvidedServiceId)}"
            data-step-id="${esc(step.AssignedServiceStepId)}" />`
        : `<span class="text-muted">—</span>`;
    return `<td class="step-select-col">${selectControl}</td>
      <td>${esc(step.AssignedServiceStepId)}</td>
      <td class="step-desc">${esc(step.StepDescription || "")}</td>
      <td class="step-num">${esc(step.RequestedQuantity)}</td>
      <td class="step-num">${esc(step.RemainingQuantity)}</td>
      <td class="step-num">${esc(step.CompletedQuantity)}</td>
      <td class="step-qty">${qtyControl}</td>
      <td class="step-status">${statusBadgeHtml(
        step.StatusId || svc.StatusId,
        step.AssignedServiceStepStatusDesc
      )}</td>`;
  }

  function stepInstructionsPanelHtml(svc, step, extraClass) {
    const stepId = step.AssignedServiceStepId || "";
    const cls = ["step-panel", extraClass].filter(Boolean).join(" ");
    const typeCfg = window.VasConfig
      ? window.VasConfig.getTypeConfig(vasConfig, svc.ProvidedServiceId)
      : null;
    const stepCfg = window.VasConfig
      ? window.VasConfig.getStepConfig(typeCfg, stepId)
      : null;
    if (window.VasConfig && window.VasConfig.stepHasContent(stepCfg)) {
      return `<div class="${cls}" data-step-panel="${esc(stepId)}">
        ${window.VasConfig.renderStepContentHtml(stepCfg, esc)}
      </div>`;
    }
    const lines = Array.isArray(step.Instructions)
      ? step.Instructions.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    if (!lines.length) return "";
    return `<div class="${cls}" data-step-panel="${esc(stepId)}">
      <ul class="vas-instruction-list mb-0">
        ${lines.map((t) => `<li>${esc(t)}</li>`).join("")}
      </ul>
    </div>`;
  }

  function orderedAssignedSteps(svc) {
    const steps = Array.isArray(svc.AssignedServiceStep)
      ? svc.AssignedServiceStep.slice()
      : [];
    if (!steps.length || !window.VasConfig) return steps;
    const typeCfg = window.VasConfig.getTypeConfig(vasConfig, svc.ProvidedServiceId);
    const order = window.VasConfig.orderedStepIds(typeCfg);
    if (!order.length) return steps;
    const rank = new Map(order.map((id, i) => [id, i]));
    return steps.sort((a, b) => {
      const aId = String(a.AssignedServiceStepId || "").trim();
      const bId = String(b.AssignedServiceStepId || "").trim();
      const ai = rank.has(aId) ? rank.get(aId) : order.length + 1;
      const bi = rank.has(bId) ? rank.get(bId) : order.length + 1;
      if (ai !== bi) return ai - bi;
      return 0;
    });
  }

  function renderStepsBodyHtml(svc, mode, activeStepId) {
    const steps = orderedAssignedSteps(svc);
    if (!steps.length) {
      return '<p class="text-muted mb-0 mt-2" style="font-size:0.9rem">No steps on this service.</p>';
    }

    if (mode === "active") {
      const rows = steps
        .map((step) => {
          const remaining = stepRemaining(step);
          const stepId = step.AssignedServiceStepId || "";
          const classes = [
            remaining > 0 ? "step-row-open" : "step-row-done",
            stepId === activeStepId ? "active-step" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return `<tr data-step-key="${esc(serviceKey(svc, step))}" data-step-row data-step-id="${esc(
            stepId
          )}" class="${classes}">
            ${stepRowCellsHtml(svc, step)}
          </tr>`;
        })
        .join("");
      const panels = steps
        .map((step) => {
          const stepId = step.AssignedServiceStepId || "";
          const cls =
            stepId === activeStepId
              ? "instruction-panel active"
              : "instruction-panel";
          return stepInstructionsPanelHtml(svc, step, cls);
        })
        .join("");
      return `<table class="steps-table compact">
          ${stepTableHeadHtml()}
          <tbody>${rows}</tbody>
        </table>
        <div class="instruction-area">${panels}</div>`;
    }

    // interleaved (Layout 2b): Step → instructions → Step → …
    // TRIAL: show thead on every step (not only step 1). Same fixed col widths
    // keep columns aligned across separate tables.
    // REVERT: prefer single shared table + one thead above step 1 (denser): map
    // steps into one <tbody> with step-instructions-row colspan panels instead.
    return steps
      .map((step) => {
        const remaining = stepRemaining(step);
        const stepId = step.AssignedServiceStepId || "";
        return `<div class="step-unit" data-step-id="${esc(stepId)}">
          <table class="steps-table compact step-unit-table">
            ${stepTableHeadHtml()}
            <tbody>
              <tr data-step-key="${esc(serviceKey(svc, step))}" data-step-id="${esc(
                stepId
              )}" class="${remaining > 0 ? "step-row-open" : "step-row-done"}">
                ${stepRowCellsHtml(svc, step)}
              </tr>
            </tbody>
          </table>
          ${stepInstructionsPanelHtml(svc, step)}
        </div>`;
      })
      .join("");
  }

  function bindQtyAndSelectIn(root) {
    if (!root) return;
    root.querySelectorAll(".qty-input").forEach((input) => {
      input.addEventListener("input", () => {
        validateQtyInput(input);
        updateExecutionButtons();
      });
      input.addEventListener("change", () => {
        const max = Number(input.dataset.remaining || 0);
        let value = Number(input.value);
        if (Number.isFinite(value) && value > max) {
          input.value = String(max);
          status(
            `Quantity cannot exceed remaining quantity (${max})`,
            "error"
          );
        }
        validateQtyInput(input);
        updateExecutionButtons();
      });
    });
    root.querySelectorAll(".step-select").forEach((cb) => {
      cb.addEventListener("change", () => {
        const card = cb.closest(".service-card");
        if (card) syncServiceCheckbox(card);
        updateExecutionButtons();
      });
    });
  }

  function bindActiveStepRows(card) {
    if (!card || card.dataset.stepView !== "active") return;
    card.querySelectorAll("[data-step-row]").forEach((row) => {
      row.addEventListener("click", (ev) => {
        if (ev.target.closest("input, button, a, label")) return;
        const stepId = row.dataset.stepId || "";
        if (!stepId) return;
        card.dataset.activeStepId = stepId;
        refreshCardStepsBody(card);
      });
    });
  }

  function refreshCardStepsBody(card) {
    const idx = Number(card.dataset.serviceIndex);
    const svc = currentServices[idx];
    if (!svc) return;
    const mode =
      card.dataset.stepView === "active" ? "active" : "interleaved";
    const steps = orderedAssignedSteps(svc);
    let activeStepId = card.dataset.activeStepId || "";
    if (
      mode === "active" &&
      (!activeStepId ||
        !steps.some((s) => s.AssignedServiceStepId === activeStepId))
    ) {
      activeStepId = steps[0]?.AssignedServiceStepId || "";
      card.dataset.activeStepId = activeStepId;
    }
    const body = card.querySelector(".service-steps-body");
    if (!body) return;
    const selected = new Set(
      Array.from(card.querySelectorAll(".step-select:checked")).map((cb) => {
        const tr = cb.closest("tr");
        return tr?.dataset.stepKey || "";
      })
    );
    const qtyByKey = {};
    body.querySelectorAll(".qty-input").forEach((input) => {
      const key = input.closest("tr")?.dataset.stepKey || "";
      if (key) qtyByKey[key] = input.value;
    });
    body.innerHTML = renderStepsBodyHtml(svc, mode, activeStepId);
    body.querySelectorAll(".step-select").forEach((cb) => {
      const key = cb.closest("tr")?.dataset.stepKey || "";
      if (key && selected.has(key)) cb.checked = true;
    });
    body.querySelectorAll(".qty-input").forEach((input) => {
      const key = input.closest("tr")?.dataset.stepKey || "";
      if (key && qtyByKey[key] != null) input.value = qtyByKey[key];
    });
    bindQtyAndSelectIn(body);
    bindActiveStepRows(card);
    syncServiceCheckbox(card);
    updateExecutionButtons();
  }

  function renderServiceCard(svc, idx) {
    const steps = orderedAssignedSteps(svc);
    const hasOpen = steps.some((s) => stepRemaining(s) > 0);
    const stepView = getPreferredStepView();
    const activeStepId = steps[0]?.AssignedServiceStepId || "";

    const itemBlock =
      svc.ItemId
        ? `<div class="service-item-row">
            <span class="item-cell">
              <strong>${esc(svc.ItemId)}</strong>
              ${renderItemImage(svc.ImageUrl)}
            </span>
            <span>${esc(svc.ItemDescription || "")}</span>
          </div>`
        : svc.IsOlpnLevel
          ? `<div class="service-item-row"><span class="text-muted">oLPN-level service</span></div>`
          : "";

    const typeCfg = window.VasConfig
      ? window.VasConfig.getTypeConfig(vasConfig, svc.ProvidedServiceId)
      : null;
    const iconUrl = window.VasConfig
      ? window.VasConfig.typeIconUrl(typeCfg)
      : "";
    const iconHtml = iconUrl
      ? `<img class="service-type-icon" src="${esc(
          iconUrl
        )}" alt="" onerror="this.remove()" />`
      : "";

    return `<article class="service-card" data-service-index="${idx}" data-provided-service-id="${esc(
      svc.ProvidedServiceId
    )}" data-step-view="${esc(stepView)}" data-active-step-id="${esc(
      activeStepId
    )}">
      <div class="service-header">
        <div class="service-title-row">
          <input type="checkbox" class="service-select" ${
            hasOpen ? "" : "disabled"
          } aria-label="Select all open steps for this service" title="Select all open steps" />
          <div class="service-title-block">
            <div class="service-title">${idx + 1}. ${esc(
      svc.ProvidedServiceId || "Service"
    )}${
      svc.Description && svc.Description !== svc.ProvidedServiceId
        ? " — " + esc(svc.Description)
        : ""
    }</div>
            ${itemBlock}
          </div>
        </div>
        <div class="service-header-end">
          <label class="step-view-picker">
            <span class="visually-hidden">Step view</span>
            <select class="form-select form-select-sm step-view-select" aria-label="Step view">
              <option value="interleaved"${
                stepView === "interleaved" ? " selected" : ""
              }>All steps</option>
              <option value="active"${
                stepView === "active" ? " selected" : ""
              }>Active step</option>
            </select>
          </label>
          ${iconHtml}
          ${statusBadgeHtml(svc.StatusId, svc.AssignedServiceStatusDesc)}
        </div>
      </div>
      <div class="service-steps-body">${renderStepsBodyHtml(
        svc,
        stepView,
        activeStepId
      )}</div>
      ${(() => {
        const itemCfg =
          svc.ItemId && window.VasConfig
            ? window.VasConfig.getItemConfig(vasConfig, svc.ItemId)
            : null;
        const sections = window.VasConfig
          ? window.VasConfig.mergedSections(typeCfg, itemCfg)
          : null;
        const cardKey = `${svc.ServiceRequestorId}|${svc.ProvidedServiceId}`;
        // Type-level content ("Shared" / VAS Type block) intentionally omitted —
        // instructions come from MAWM step.Instructions in Layout 6 panels.
        return (
          renderConfigBlock("item", itemCfg) +
          renderCaptureSections(cardKey, sections)
        );
      })()}
    </article>`;
  }

  /** Primary: MAWM Sequence; secondary: ProvidedServiceId then Description (base). */
  function compareAssignedServices(a, b) {
    const seqA = Number(a?.Sequence);
    const seqB = Number(b?.Sequence);
    const aHas = Number.isFinite(seqA);
    const bHas = Number.isFinite(seqB);
    if (aHas && bHas && seqA !== seqB) return seqA - seqB;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const idCmp = String(a?.ProvidedServiceId || "").localeCompare(
      String(b?.ProvidedServiceId || ""),
      undefined,
      { sensitivity: "base" }
    );
    if (idCmp) return idCmp;
    const descCmp = String(a?.Description || "").localeCompare(
      String(b?.Description || ""),
      undefined,
      { sensitivity: "base" }
    );
    if (descCmp) return descCmp;
    return String(a?.ServiceRequestorId || "").localeCompare(
      String(b?.ServiceRequestorId || ""),
      undefined,
      { sensitivity: "base" }
    );
  }

  function renderServices(services) {
    const list = Array.isArray(services) ? services.slice() : [];
    list.sort(compareAssignedServices);
    currentServices = list;
    activeServiceIndex = 0;
    if (!currentServices.length) {
      els.serviceList.innerHTML =
        '<p class="text-muted mb-0">No assigned service records returned.</p>';
      if (els.serviceNav) els.serviceNav.innerHTML = "";
      applyViewMode();
      updateExecutionButtons();
      return;
    }

    let html = "";
    currentServices.forEach((svc, idx) => {
      const prev = currentServices[idx - 1];
      const isOlpn = !!svc.IsOlpnLevel;
      if (idx === 0 || isOlpn !== !!prev?.IsOlpnLevel) {
        html += `<h3 class="service-group-title">${
          isOlpn ? "oLPN Services" : "Item Services"
        }</h3>`;
      }
      html += renderServiceCard(svc, idx);
    });
    els.serviceList.innerHTML = html;

    bindQtyAndSelectIn(els.serviceList);
    els.serviceList.querySelectorAll(".service-select").forEach((cb) => {
      cb.addEventListener("change", () => {
        const card = cb.closest(".service-card");
        if (!card) return;
        setCardStepsSelected(card, cb.checked);
        updateExecutionButtons();
      });
    });
    els.serviceList.querySelectorAll(".step-view-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const card = sel.closest(".service-card");
        if (!card) return;
        const mode = sel.value === "active" ? "active" : "interleaved";
        card.dataset.stepView = mode;
        setPreferredStepView(mode);
        refreshCardStepsBody(card);
      });
    });
    els.serviceList.querySelectorAll(".service-card").forEach((card) => {
      syncServiceCheckbox(card);
      bindActiveStepRows(card);
    });

    if (typeof window.bindItemImagePreview === "function") {
      delete els.serviceList.dataset.itemImagePreviewBound;
      window.bindItemImagePreview(els.serviceList);
    }
    if (window.VasPads) {
      window.VasPads.bindAllPads(els.serviceList);
    }
    if (window.VasImageModal) window.VasImageModal.bindTriggers(els.serviceList);
    syncCameraBtn();
    applyViewMode();
    updateExecutionButtons();
  }

  async function loadOlpnIds(options = {}) {
    const silent = !!options.silent;
    olpnIdsLoaded = false;
    olpnIds = new Set();
    updateLoadButton();
    if (!silent) status("Loading oLPN list...", "info");
    const res = await api("olpns", { org, token });
    if (!res.success) {
      olpnIdsLoaded = true;
      updateLoadButton();
      if (!silent) status(res.error || "Could not load oLPN list", "error");
      else console.warn("[VAS] background oLPN list failed:", res.error);
      return;
    }
    (res.ids || []).forEach((id) => olpnIds.add(String(id).trim()));
    olpnIdsLoaded = true;
    updateLoadButton();
    if (!silent) status(`Ready — ${olpnIds.size} oLPN(s) available`, "success");
  }

  async function enterAuthenticated(res, value, options = {}) {
    token = res.token;
    org = (res.org || value || "").toUpperCase();
    localStorage.setItem("vas_lastOrg", org);
    els.orgSection.style.display = "none";
    els.mainUI.style.display = "block";
    updateLoadButton();
    els.olpnInput.focus();
    trackEvent("auth_success", { org, source: res.source || null });
    if (window.VasConfig) {
      try {
        vasConfig = await window.VasConfig.loadVasConfigForOrg(org);
      } catch (err) {
        console.warn("[VAS] config load failed", err);
        vasConfig = window.VasConfig.emptyConfig();
      }
    }

    const deepLinkOlpn = String(options.deepLinkOlpn || "").trim();
    if (deepLinkOlpn) {
      els.olpnInput.value = deepLinkOlpn;
      updateLoadButton();
      if (res.source === "file") {
        status("Authenticated via local .token — loading oLPN...", "success");
      } else {
        status("Authenticated — loading oLPN...", "success");
      }
      // Warm full list for later manual entry; do not block deep-link lookup
      loadOlpnIds({ silent: true }).catch((err) =>
        console.warn("[VAS] background oLPN list failed", err)
      );
      await loadOlpn({ allowWithoutList: true });
      return;
    }

    if (res.source === "file") {
      status("Authenticated via local .token — loading oLPNs...", "success");
    } else {
      status("Authenticated — loading oLPNs...", "success");
    }
    await loadOlpnIds();
  }

  async function authenticate(options = {}) {
    const value = (options.org || els.orgInput.value || "").trim().toUpperCase();
    if (!value) return status("ORG required", "error");
    if (!options.silent) {
      status("Authenticating...");
      setBusy(true, "Authenticating...");
    }
    const payload = { org: value };
    if (options.forceOauth) payload.force_oauth = true;
    const res = await api("auth", payload);
    if (!options.silent) setBusy(false);
    if (!res.success) {
      trackEvent("auth_failed", { org: value, error: res.error });
      if (!options.silent) status(res.error || "Auth failed", "error");
      return false;
    }
    await enterAuthenticated(res, value, {
      deepLinkOlpn: options.deepLinkOlpn
    });
    return true;
  }

  async function loadOlpn(options = {}) {
    const olpnId = (els.olpnInput.value || "").trim();
    if (!token || !org || !olpnId) return;
    if (!options.allowWithoutList && !isValidOlpn(olpnId)) return;
    els.results.style.display = "none";
    els.serviceList.innerHTML = "";
    currentOlpnId = olpnId;
    currentRequestorIds = [];
    currentOlpnRecord = null;
    currentItemMap = {};
    currentServices = [];
    status("Looking up oLPN and ServiceRequestorIds...");
    setBusy(true, "Searching oLPN...");

    const step1 = await api("search_olpn_vas", {
      org,
      token,
      olpn_id: olpnId
    });
    if (!step1.success) {
      setBusy(false);
      trackEvent("olpn_vas_lookup_failed", {
        olpn_id: olpnId,
        error: step1.error
      });
      return status(step1.error || "oLPN VAS lookup failed", "error");
    }

    currentRequestorIds = step1.requestor_ids || [];
    currentOlpnRecord = step1.olpn_record || step1.olpn || {};

    status(
      `Resolved ${currentRequestorIds.length} requestor id(s); fetching assigned services...`
    );
    const step2 = await api("assigned_services", {
      org,
      token,
      requestor_ids: currentRequestorIds,
      olpn_record: currentOlpnRecord
    });
    setBusy(false);

    if (!step2.success) {
      trackEvent("assigned_services_failed", {
        olpn_id: olpnId,
        error: step2.error
      });
      return status(step2.error || "Assigned services lookup failed", "error");
    }

    currentItemMap = step2.requestor_item_map || {};
    const olpn = step1.olpn || {};
    els.olpnMeta.textContent =
      `oLPN ${olpn.OlpnId || olpnId}` +
      (olpn.OrderId ? ` · Order ${olpn.OrderId}` : "") +
      ` · Requestor IDs: ${currentRequestorIds.join(", ")}`;

    renderServices(step2.services || []);
    els.results.style.display = "block";
    trackEvent("olpn_vas_lookup_success", {
      olpn_id: olpnId,
      requestor_count: currentRequestorIds.length,
      service_count: (step2.services || []).length,
      attempt: step1.attempt
    });
    status(
      `Found ${(step2.services || []).length} assigned service(s)`,
      "success"
    );
  }

  async function runCompletions(mode) {
    if (!currentOlpnId || !token || !org) return;
    const { completions, errors } = collectCompletions(mode);
    if (errors.length) {
      return status(errors[0], "error");
    }
    if (!completions.length) {
      return status(
        mode === "selected"
          ? "Select at least one open step to complete"
          : "No open steps remaining",
        "error"
      );
    }

    setBusy(true, "Completing VAS...");
    status(`Completing ${completions.length} step(s)...`);
    const res = await api("perform_vas", {
      org,
      token,
      olpn_id: currentOlpnId,
      requestor_ids: currentRequestorIds,
      olpn_record: currentOlpnRecord,
      requestor_item_map: currentItemMap,
      completions
    });
    setBusy(false);

    if (!res.success) {
      trackEvent("perform_vas_failed", {
        olpn_id: currentOlpnId,
        error: res.error
      });
      return status(res.error || "performVas failed", "error");
    }

    currentItemMap = res.requestor_item_map || currentItemMap;
    renderServices(res.services || []);
    trackEvent("perform_vas_success", {
      olpn_id: currentOlpnId,
      completed_count: (res.completed || []).length
    });
    status(
      `Completed ${(res.completed || []).length} step(s)` +
        (res.warning ? ` — ${res.warning}` : ""),
      res.warning ? "info" : "success"
    );
  }

  els.orgBtn.addEventListener("click", () => authenticate());
  els.orgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      authenticate();
    }
  });
  els.olpnInput.addEventListener("input", updateLoadButton);
  els.olpnInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !els.inspectBtn.disabled) {
      e.preventDefault();
      loadOlpn();
    }
  });
  els.inspectBtn.addEventListener("click", loadOlpn);
  els.completeSelectedBtn.addEventListener("click", () =>
    runCompletions("selected")
  );
  els.completeAllBtn.addEventListener("click", () => runCompletions("all"));
  els.selectAllBtn.addEventListener("click", () => {
    els.serviceList.querySelectorAll(".service-card").forEach((card) => {
      const serviceCb = card.querySelector(".service-select");
      if (!serviceCb || serviceCb.disabled) return;
      setCardStepsSelected(card, true);
    });
    updateExecutionButtons();
  });

  if (els.viewSelect) {
    els.viewSelect.value = getPreferredView();
    els.viewSelect.addEventListener("change", () => {
      setPreferredView(els.viewSelect.value);
      applyViewMode();
    });
  }

  applyAppTitle();
  window
    .matchMedia("(max-width: 768px)")
    .addEventListener("change", applyAppTitle);

  function syncExecutionBarStickyOffset() {
    if (!els.executionBar) return;
    const h = Math.ceil(els.executionBar.getBoundingClientRect().height);
    document.documentElement.style.setProperty(
      "--execution-bar-offset",
      `${Math.max(h, 48)}px`
    );
  }
  syncExecutionBarStickyOffset();
  if (els.executionBar && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncExecutionBarStickyOffset).observe(els.executionBar);
  }
  window.addEventListener("resize", syncExecutionBarStickyOffset);

  /** Case-insensitive query params: theme, org/organization, olpn/OLPN/oLPN/… */
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const ci = {};
    for (const [key, value] of params.entries()) {
      ci[String(key).toLowerCase()] = value;
    }
    return {
      org: String(ci.org || ci.organization || "").trim(),
      theme: String(ci.theme || "").trim(),
      olpn: String(
        ci.olpn || ci.olpnid || ci.olpn_id || ci["olpn-id"] || ""
      ).trim()
    };
  }

  const urlParams = parseUrlParams();

  if (Themes) {
    if (urlParams.theme && urlParams.theme.toUpperCase() === "N") {
      if (els.themeBtn) els.themeBtn.style.display = "none";
    } else if (urlParams.theme) {
      const themeKey = Themes.themes[urlParams.theme]
        ? urlParams.theme
        : Themes.themes[urlParams.theme.toLowerCase()]
          ? urlParams.theme.toLowerCase()
          : null;
      if (themeKey) {
        localStorage.setItem("selectedTheme", themeKey);
        Themes.applyTheme(themeKey, els.themeLogo);
      }
    }
  }

  if (Themes && els.themeBtn && themeModal) {
    Themes.wireThemePicker({
      themeSelectorBtn: els.themeBtn,
      themeModal,
      themeList: els.themeList,
      themeLogo: els.themeLogo
    });
  }

  if (window.VasPads) {
    window.VasPads.wireCameraButton({
      cameraBtn: els.cameraBtn,
      fileInput: els.cameraFileInput,
      countEl: els.cameraPhotoCount,
      modalEl: document.getElementById("cameraModal"),
      videoEl: document.getElementById("cameraVideo"),
      canvasEl: document.getElementById("cameraCanvas"),
      captureBtn: document.getElementById("capturePhotoBtn"),
      galleryEl: document.getElementById("cameraGallery"),
      galleryEmptyEl: document.getElementById("cameraGalleryEmpty"),
      fileFallbackBtn: document.getElementById("cameraFileFallbackBtn")
    });
  }

  updateLoadButton();
  api("app_opened", {});
  trackEvent("app_opened", {});

  (async function bootstrapSession() {
    const session = await api("session", {});
    const remembered =
      urlParams.org ||
      (session && session.org) ||
      localStorage.getItem("vas_lastOrg") ||
      "";
    if (urlParams.org) els.orgInput.value = urlParams.org.toUpperCase();
    else if (remembered) els.orgInput.value = remembered;

    const orgToAuth = (els.orgInput.value || "").trim();
    const deepLinkOlpn = urlParams.olpn || "";
    if (session && session.has_token && orgToAuth) {
      const ok = await authenticate({
        org: orgToAuth,
        silent: true,
        deepLinkOlpn
      });
      if (ok) return;
    }
    if (urlParams.org) {
      await authenticate({ org: urlParams.org, deepLinkOlpn });
      return;
    }
    els.orgSection.style.display = "block";
  })();
})();
