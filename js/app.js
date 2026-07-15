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
    serviceList: document.getElementById("serviceList"),
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
    return `<span class="item-image-wrap item-image-wrap--inline" data-image-url="${esc(safe)}">
      <img class="item-image-thumb" src="${esc(safe)}" alt="" loading="lazy" decoding="async"
        onerror="this.closest('.item-image-wrap')?.remove()" />
    </span>`;
  }

  function renderContentBlocks(content) {
    if (!content || !content.length) return "";
    return `<div class="vas-content-list">${content
      .map((block) => {
        if (block.type === "image") {
          const imgStyle = window.VasConfig
            ? window.VasConfig.imageBlockStyle(block)
            : "width:100%;";
          return `<div class="vas-content-image">
            <button type="button" class="vas-content-image-btn" data-image-url="${esc(
              block.url
            )}" data-image-caption="${esc(block.caption || "")}" title="Open">
              <img src="${esc(block.url)}" alt="${esc(block.caption || "")}" loading="lazy"
                style="${esc(imgStyle)}"
                onerror="this.closest('.vas-content-image')?.remove()" />
            </button>
            ${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ""}
          </div>`;
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

  function updateExecutionButtons() {
    const open = openSteps(currentServices);
    const selected = els.serviceList.querySelectorAll(
      ".service-select:checked:not(:disabled)"
    );
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
      const checked = card.querySelector(".service-select")?.checked;
      card.querySelectorAll(".qty-input").forEach((input) => {
        const remaining = Number(input.dataset.remaining || 0);
        if (remaining <= 0) return;
        if (mode === "selected" && !checked) return;
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

  function renderServiceCard(svc, idx) {
    const statusText = formatAssignedStatus(
      svc.StatusId,
      svc.AssignedServiceStatusDesc
    );
    const steps = Array.isArray(svc.AssignedServiceStep)
      ? svc.AssignedServiceStep
      : [];
    const hasOpen = steps.some((s) => stepRemaining(s) > 0);

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

    const stepsHtml = steps.length
      ? `<table class="steps-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Description</th>
              <th>Requested</th>
              <th>Remaining</th>
              <th>Completed</th>
              <th>Qty to complete</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${steps
              .map((step) => {
                const remaining = stepRemaining(step);
                const stepStatus = formatAssignedStatus(
                  step.StatusId || svc.StatusId,
                  step.AssignedServiceStepStatusDesc
                );
                const instructions = (step.Instructions || [])
                  .map((t) => `<div class="step-instructions">${esc(t)}</div>`)
                  .join("");
                const qtyControl =
                  remaining > 0
                    ? `<input type="number" class="form-control qty-input" min="0.0001" step="any"
                        value="${esc(remaining)}"
                        data-remaining="${esc(remaining)}"
                        data-requestor-id="${esc(svc.ServiceRequestorId)}"
                        data-provided-service-id="${esc(svc.ProvidedServiceId)}"
                        data-step-id="${esc(step.AssignedServiceStepId)}" />`
                    : `<span class="text-muted">—</span>`;
                return `<tr data-step-key="${esc(serviceKey(svc, step))}">
                  <td>${esc(step.AssignedServiceStepId)}</td>
                  <td>${esc(step.StepDescription)}${instructions}</td>
                  <td>${esc(step.RequestedQuantity)}</td>
                  <td>${esc(step.RemainingQuantity)}</td>
                  <td>${esc(step.CompletedQuantity)}</td>
                  <td>${qtyControl}</td>
                  <td>${esc(stepStatus)}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>`
      : '<p class="text-muted mb-0 mt-2" style="font-size:0.85rem">No steps on this service.</p>';

    return `<article class="service-card" data-provided-service-id="${esc(
      svc.ProvidedServiceId
    )}">
      <div class="service-header">
        <div class="service-title-row">
          <input type="checkbox" class="service-select" ${
            hasOpen ? "" : "disabled"
          } aria-label="Select service" />
          <div>
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
        <div><span class="badge text-bg-secondary">${esc(statusText)}</span></div>
      </div>
      <div class="service-meta">
        <div>ServiceRequestorTypeId: ${esc(svc.ServiceRequestorTypeId)}</div>
        <div>ServiceRequestorId: ${esc(svc.ServiceRequestorId)}</div>
        <div>ServiceUomId: ${esc(svc.ServiceUomId)}</div>
      </div>
      ${stepsHtml}
      ${(() => {
        const typeCfg = window.VasConfig
          ? window.VasConfig.getTypeConfig(vasConfig, svc.ProvidedServiceId)
          : null;
        const itemCfg =
          svc.ItemId && window.VasConfig
            ? window.VasConfig.getItemConfig(vasConfig, svc.ItemId)
            : null;
        const sections = window.VasConfig
          ? window.VasConfig.mergedSections(typeCfg, itemCfg)
          : null;
        const cardKey = `${svc.ServiceRequestorId}|${svc.ProvidedServiceId}`;
        return (
          renderConfigBlock("type", typeCfg) +
          renderConfigBlock("item", itemCfg) +
          renderCaptureSections(cardKey, sections)
        );
      })()}
    </article>`;
  }

  function renderServices(services) {
    currentServices = Array.isArray(services) ? services : [];
    if (!currentServices.length) {
      els.serviceList.innerHTML =
        '<p class="text-muted mb-0">No assigned service records returned.</p>';
      updateExecutionButtons();
      return;
    }

    const olpnServices = currentServices.filter((s) => s.IsOlpnLevel);
    const itemServices = currentServices.filter((s) => !s.IsOlpnLevel);

    let html = "";
    let idx = 0;
    if (olpnServices.length) {
      html += `<h3 class="service-group-title">oLPN Services</h3>`;
      html += olpnServices.map((s) => renderServiceCard(s, idx++)).join("");
    }
    if (itemServices.length) {
      html += `<h3 class="service-group-title">Item Services</h3>`;
      html += itemServices.map((s) => renderServiceCard(s, idx++)).join("");
    }
    els.serviceList.innerHTML = html;

    els.serviceList.querySelectorAll(".qty-input").forEach((input) => {
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
    els.serviceList.querySelectorAll(".service-select").forEach((cb) => {
      cb.addEventListener("change", updateExecutionButtons);
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
    updateExecutionButtons();
  }

  async function loadOlpnIds() {
    olpnIdsLoaded = false;
    olpnIds = new Set();
    updateLoadButton();
    status("Loading oLPN list...", "info");
    const res = await api("olpns", { org, token });
    if (!res.success) {
      status(res.error || "Could not load oLPN list", "error");
      olpnIdsLoaded = true;
      updateLoadButton();
      return;
    }
    (res.ids || []).forEach((id) => olpnIds.add(String(id).trim()));
    olpnIdsLoaded = true;
    updateLoadButton();
    status(`Ready — ${olpnIds.size} oLPN(s) available`, "success");
  }

  async function enterAuthenticated(res, value) {
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
    await enterAuthenticated(res, value);
    return true;
  }

  async function loadOlpn() {
    const olpnId = (els.olpnInput.value || "").trim();
    if (!isValidOlpn(olpnId) || !token || !org) return;
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
          ? "Select at least one open service to complete"
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
    els.serviceList
      .querySelectorAll(".service-select:not(:disabled)")
      .forEach((cb) => {
        cb.checked = true;
      });
    updateExecutionButtons();
  });

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
    if (session && session.has_token && orgToAuth) {
      const ok = await authenticate({ org: orgToAuth, silent: true });
      if (ok) {
        if (urlParams.olpn) {
          els.olpnInput.value = urlParams.olpn;
          updateLoadButton();
          if (isValidOlpn(urlParams.olpn)) await loadOlpn();
        }
        return;
      }
    }
    if (urlParams.org) {
      const ok = await authenticate({ org: urlParams.org });
      if (ok && urlParams.olpn) {
        els.olpnInput.value = urlParams.olpn;
        updateLoadButton();
        if (isValidOlpn(urlParams.olpn)) await loadOlpn();
      }
      return;
    }
    els.orgSection.style.display = "block";
  })();
})();
