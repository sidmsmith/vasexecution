(function () {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function typeCfg(svc) {
    return window.MOCK.typeConfig[svc.ProvidedServiceId] || {
      icon: "/assets/icons/vas-type-default.svg",
      shared: "",
      steps: {}
    };
  }

  function stepInstructions(svc, stepId) {
    const cfg = typeCfg(svc);
    return cfg.steps[stepId] || [];
  }

  function itemLine(svc) {
    if (svc.ItemId) {
      return `<div class="service-item-row"><strong>${esc(svc.ItemId)}</strong> ${esc(
        svc.ItemDescription || ""
      )}</div>`;
    }
    if (svc.IsOlpnLevel) {
      return `<div class="service-item-row"><span class="text-muted">oLPN-level service</span></div>`;
    }
    return "";
  }

  function compactStepsTable(svc, opts) {
    const activeId = opts && opts.activeStepId;
    const clickable = !!(opts && opts.clickable);
    const rows = svc.steps
      .map((st) => {
        const classes = [];
        if (activeId === st.id) classes.push("active-step");
        const attrs = [];
        if (classes.length) attrs.push(`class="${classes.join(" ")}"`);
        if (clickable) {
          attrs.push(`data-step-row data-step-id="${esc(st.id)}"`);
        }
        return `<tr${attrs.length ? " " + attrs.join(" ") : ""}>
          <td class="step-select-col"><input type="checkbox" class="step-select" aria-label="Select ${esc(
            st.id
          )}" /></td>
          <td>${esc(st.id)}</td>
          <td class="step-desc">${esc(st.desc)}</td>
          <td>${st.req}</td>
          <td>${st.rem}</td>
          <td>${st.comp}</td>
          <td><input type="number" class="form-control qty-input" value="${st.rem}" /></td>
          <td><span class="badge text-bg-secondary">${esc(svc.Status)}</span></td>
        </tr>`;
      })
      .join("");
    return `<table class="steps-table compact">
      <thead>
        <tr>
          <th class="step-select-col"></th>
          <th>Step</th>
          <th>Description</th>
          <th>Req</th>
          <th>Rem</th>
          <th>Comp</th>
          <th>Qty</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function sharedBlock(svc) {
    const shared = typeCfg(svc).shared;
    if (!shared) return "";
    return `<div class="shared-content"><strong>Shared:</strong> ${esc(shared)}</div>`;
  }

  function stepPanelHtml(svc, stepId, extraClass) {
    const lines = stepInstructions(svc, stepId);
    if (!lines.length) return "";
    const cls = extraClass ? `step-panel ${extraClass}` : "step-panel";
    return `<div class="${cls}" data-step-panel="${esc(stepId)}">
      <h5>Step: ${esc(stepId)}</h5>
      <ul class="vas-instruction-list mb-0">
        ${lines.map((t) => `<li>${esc(t)}</li>`).join("")}
      </ul>
    </div>`;
  }

  function allStepPanels(svc) {
    return svc.steps.map((st) => stepPanelHtml(svc, st.id)).join("");
  }

  /** Single-step table row (same columns as compact table). */
  function singleStepTable(svc, st, opts) {
    const showHead = !(opts && opts.hideHead);
    const head = showHead
      ? `<thead>
        <tr>
          <th class="step-select-col"></th>
          <th>Step</th>
          <th>Description</th>
          <th>Req</th>
          <th>Rem</th>
          <th>Comp</th>
          <th>Qty</th>
          <th>Status</th>
        </tr>
      </thead>`
      : "";
    return `<table class="steps-table compact step-unit-table">
      ${head}
      <tbody>
        <tr>
          <td class="step-select-col"><input type="checkbox" class="step-select" aria-label="Select ${esc(
            st.id
          )}" /></td>
          <td>${esc(st.id)}</td>
          <td class="step-desc">${esc(st.desc)}</td>
          <td>${st.req}</td>
          <td>${st.rem}</td>
          <td>${st.comp}</td>
          <td><input type="number" class="form-control qty-input" value="${st.rem}" /></td>
          <td><span class="badge text-bg-secondary">${esc(svc.Status)}</span></td>
        </tr>
      </tbody>
    </table>`;
  }

  /** Step 1 → instructions → Step 2 → instructions (interleaved). */
  function interleavedSteps(svc) {
    return svc.steps
      .map(
        (st, i) => `<div class="step-unit" data-step-id="${esc(st.id)}">
      ${singleStepTable(svc, st, { hideHead: i > 0 })}
      ${stepPanelHtml(svc, st.id)}
    </div>`
      )
      .join("");
  }

  function capturePlaceholder(label) {
    return `<div class="capture-placeholder">${esc(
      label || "Signature · Photos (camera) · Markup pad — unchanged from today"
    )}</div>`;
  }

  function serviceHeader(svc, opts) {
    const cfg = typeCfg(svc);
    const mode = opts && opts.stepViewMode;
    const viewPicker =
      mode
        ? `<label class="step-view-picker">
            <span class="visually-hidden">Step view</span>
            <select class="form-select form-select-sm step-view-select" data-step-view-select data-svc-idx="${svc.idx}" aria-label="Step view">
              <option value="interleaved"${mode === "interleaved" ? " selected" : ""}>All steps</option>
              <option value="active"${mode === "active" ? " selected" : ""}>Active step</option>
            </select>
          </label>`
        : "";
    return `<div class="service-header">
      <div class="service-title-row">
        <input type="checkbox" class="service-select" aria-label="Select service" />
        <div class="service-title-block">
          <div class="service-title">${svc.idx}. ${esc(svc.ProvidedServiceId)}</div>
          ${itemLine(svc)}
        </div>
      </div>
      <div class="service-header-end">
        ${viewPicker}
        <img class="service-type-icon" src="${esc(cfg.icon)}" alt="" onerror="this.remove()" />
        <span class="badge text-bg-secondary">${esc(svc.Status)}</span>
      </div>
    </div>`;
  }

  function chrome(activeLayout) {
    const m = window.MOCK;
    const layouts = [
      ["layout-2-all-panels.html", "2 All panels"],
      ["layout-2b-interleaved.html", "2b Interleaved"],
      ["layout-3-active-step.html", "3 Active step"],
      ["layout-4-step-tabs.html", "4 Tabs"],
      ["layout-5-service-step-nav.html", "5 Nav"],
      ["layout-6-toggle.html", "6 Toggle 2b/3"]
    ];
    const nav = layouts
      .map(
        ([href, label]) =>
          `<a href="${href}" class="${activeLayout === href ? "active" : ""}">${label}</a>`
      )
      .join("");
    return `<div class="mock-banner">
        Static mock · Layout samples · <a href="index.html">All layouts</a>
      </div>
      <nav class="mock-nav">${nav}</nav>
      <div class="olpn-meta">oLPN ${esc(m.olpnId)} · Order ${esc(m.orderId)} · Requestor IDs: ${esc(
      m.requestorIds.join(", ")
    )}</div>
      <div class="execution-bar">
        <div class="execution-bar-actions">
          <button type="button" class="btn btn-primary" disabled>Complete Selected</button>
          <button type="button" class="btn btn-primary" disabled>Complete All</button>
          <button type="button" class="btn btn-outline-secondary">Select All Open</button>
        </div>
        <div class="vas-view-picker">
          <label class="form-label" for="viewSelect">View</label>
          <select class="form-select form-select-sm" id="viewSelect" disabled>
            <option>2 — Stacked</option>
          </select>
        </div>
      </div>`;
  }

  window.MockUI = {
    esc,
    typeCfg,
    stepInstructions,
    compactStepsTable,
    singleStepTable,
    interleavedSteps,
    sharedBlock,
    stepPanelHtml,
    allStepPanels,
    capturePlaceholder,
    serviceHeader,
    chrome
  };
})();
