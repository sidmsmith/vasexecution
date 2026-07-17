(function () {
  const VasConfig = window.VasConfig;
  let token = null;
  let org = null;
  let defaultsDoc = null;
  let draft = null;
  /** @type {Array|null} */
  let diffTypes = null;
  /** @type {object|null} */
  let diffSummary = null;
  let filter = "all";
  /** @type {Set<string>} */
  const selected = new Set();
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Set<string>} */
  const expandedInstr = new Set();
  let confirmAction = null;

  const INSTR_DIFF_STATUSES = new Set([
    "instructions_differ",
    "instructions_missing_in_wms",
    "instructions_missing_in_config"
  ]);

  const confirmModalEl = document.getElementById("confirmModal");
  const confirmModal =
    confirmModalEl && window.bootstrap
      ? new bootstrap.Modal(confirmModalEl)
      : null;

  const els = {
    orgSection: document.getElementById("orgSection"),
    orgInput: document.getElementById("org"),
    orgBtn: document.getElementById("orgBtn"),
    mainUI: document.getElementById("mainUI"),
    status: document.getElementById("status"),
    summaryLine: document.getElementById("summaryLine"),
    diffBody: document.getElementById("diffBody"),
    emptyState: document.getElementById("emptyState"),
    selectAllVisible: document.getElementById("selectAllVisible"),
    selectionHint: document.getElementById("selectionHint"),
    includeInstructions: document.getElementById("includeInstructions"),
    refreshBtn: document.getElementById("refreshBtn"),
    pushBtn: document.getElementById("pushBtn"),
    pushInstrBtn: document.getElementById("pushInstrBtn"),
    pullBtn: document.getElementById("pullBtn"),
    saveBtn: document.getElementById("saveBtn"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmBody: document.getElementById("confirmBody"),
    confirmOkBtn: document.getElementById("confirmOkBtn")
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
      return {
        success: false,
        error: raw.slice(0, 160) || `HTTP ${response.status}`
      };
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

  function badge(statusKey) {
    const label = String(statusKey || "").replace(/_/g, " ");
    return `<span class="sync-badge sync-badge-${esc(statusKey)}">${esc(
      label
    )}</span>`;
  }

  function typeHasInstructionDiff(t) {
    if (!t) return false;
    if (INSTR_DIFF_STATUSES.has(t.instructionStatus)) return true;
    return (Array.isArray(t.steps) ? t.steps : []).some((s) =>
      INSTR_DIFF_STATUSES.has(s && s.instructionStatus)
    );
  }

  function visibleTypes() {
    const list = Array.isArray(diffTypes) ? diffTypes : [];
    if (filter === "all") return list;
    if (filter === "instructions_differ") {
      return list.filter((t) => typeHasInstructionDiff(t));
    }
    return list.filter((t) => t && t.status === filter);
  }

  function draftPayload() {
    return {
      version: draft.version || 1,
      vasTypes: draft.vasTypes,
      items: draft.items
    };
  }

  function updateSelectionHint() {
    const n = selected.size;
    els.selectionHint.textContent = n
      ? `${n} type${n === 1 ? "" : "s"} selected`
      : "No selection — create push uses Missing in WMS; instruction merge needs a selection";
    const vis = visibleTypes();
    const allSelected =
      vis.length > 0 && vis.every((t) => selected.has(String(t.id)));
    els.selectAllVisible.checked = allSelected;
  }

  function renderSummary() {
    const s = diffSummary || {};
    els.summaryLine.textContent = [
      `Types: ${s.types ?? 0}`,
      `aligned ${s.aligned ?? 0}`,
      `missing in WMS ${s.missing_in_wms ?? 0}`,
      `missing in config ${s.missing_in_config ?? 0}`,
      `instr differ ${s.types_instructions_differ ?? 0}`,
      `whitespace warns ${s.id_whitespace ?? 0}`,
      `steps −WMS ${s.steps_missing_in_wms ?? 0} / −config ${s.steps_missing_in_config ?? 0}`
    ].join(" · ");
  }

  function renderInstrCompare(configTexts, wmsTexts) {
    const cfg = Array.isArray(configTexts) ? configTexts : [];
    const wms = Array.isArray(wmsTexts) ? wmsTexts : [];
    const n = Math.max(cfg.length, wms.length, 1);
    let rows = "";
    for (let i = 0; i < n; i++) {
      const c = cfg[i];
      const w = wms[i];
      const cHtml =
        c == null
          ? `<span class="sync-instr-empty">—</span>`
          : esc(c);
      const wHtml =
        w == null
          ? `<span class="sync-instr-empty">—</span>`
          : esc(w);
      rows += `<tr><td class="sync-instr-seq">${i + 1}</td><td>${cHtml}</td><td>${wHtml}</td></tr>`;
    }
    return `<table class="sync-instr-table">
      <thead><tr><th>#</th><th>Config</th><th>WMS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderTable() {
    const rows = visibleTypes();
    els.diffBody.innerHTML = "";
    els.emptyState.hidden = rows.length > 0;

    rows.forEach((t) => {
      const id = String(t.id || "");
      const isOpen = expanded.has(id);
      const steps = Array.isArray(t.steps) ? t.steps : [];
      const warnHtml = (t.warnings || [])
        .map((w) => {
          if (!w) return "";
          if (w.code === "id_whitespace") {
            return `<div class="sync-warn"><i class="fa-solid fa-triangle-exclamation"></i> whitespace on ${esc(
              w.field || "id"
            )}: “${esc(w.raw)}”</div>`;
          }
          return `<div class="sync-warn">${esc(w.message || w.code || "")}</div>`;
        })
        .join("");

      const typeInstrBadge = t.instructionStatus
        ? ` ${badge(t.instructionStatus)}`
        : "";

      const tr = document.createElement("tr");
      tr.className = "sync-type-row";
      tr.dataset.typeId = id;
      tr.innerHTML = `
        <td>
          <input type="checkbox" class="form-check-input type-check" data-id="${esc(
            id
          )}" ${selected.has(id) ? "checked" : ""} />
        </td>
        <td>
          <button type="button" class="sync-expand" data-expand="${esc(
            id
          )}" aria-label="Toggle steps">
            <i class="fa-solid fa-chevron-${isOpen ? "down" : "right"}"></i>
          </button>
          <span class="sync-type-id">${esc(id)}</span>
          <span class="sync-type-title">${esc(t.title || "")}</span>
        </td>
        <td>${badge(t.status)}${typeInstrBadge}</td>
        <td>${steps.length}</td>
        <td>${warnHtml || "—"}</td>`;
      els.diffBody.appendChild(tr);

      if (isOpen) {
        steps.forEach((step) => {
          const stepKey = `${id}::${step.id}`;
          const instrOpen = expandedInstr.has(stepKey);
          const cfgN = (step.configInstructions || []).length;
          const wmsN = (step.wmsInstructions || []).length;
          const sr = document.createElement("tr");
          sr.className = "sync-step-row";
          sr.innerHTML = `
            <td></td>
            <td class="sync-step-indent">
              <button type="button" class="sync-expand sync-expand-instr" data-expand-instr="${esc(
                stepKey
              )}" aria-label="Toggle instructions">
                <i class="fa-solid fa-chevron-${instrOpen ? "down" : "right"}"></i>
              </button>
              ${esc(step.id)}
              <span class="sync-instr-counts">${cfgN} cfg / ${wmsN} wms</span>
            </td>
            <td>${badge(step.status)} ${badge(
              step.instructionStatus || "instructions_aligned"
            )}</td>
            <td></td>
            <td></td>`;
          els.diffBody.appendChild(sr);

          if (instrOpen) {
            const ir = document.createElement("tr");
            ir.className = "sync-instr-row";
            ir.innerHTML = `
              <td></td>
              <td colspan="4" class="sync-instr-detail">
                ${renderInstrCompare(
                  step.configInstructions,
                  step.wmsInstructions
                )}
              </td>`;
            els.diffBody.appendChild(ir);
          }
        });
      }
    });

    updateSelectionHint();
  }

  async function loadDraft() {
    const bust = `?t=${Date.now()}`;
    const defaultsRaw = await fetchJson(`/config/vas.default.json${bust}`);
    if (!defaultsRaw) {
      status("Could not load /config/vas.default.json", "error");
      draft = VasConfig.emptyConfig();
      return;
    }
    defaultsDoc = VasConfig.normalizeConfig(defaultsRaw);
    const orgDoc = await fetchJson(
      `/config/orgs/${encodeURIComponent(org)}.json${bust}`
    );
    draft = orgDoc
      ? VasConfig.mergeVasConfigs(defaultsDoc, orgDoc)
      : VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));
  }

  async function refreshDiff() {
    if (!org || !token || !draft) return;
    status("Loading WMS catalog and computing diff...");
    const res = await api("vas_sync_diff", {
      org,
      token,
      config: draftPayload()
    });
    if (!res.success) {
      status(res.error || "Diff failed", "error");
      return;
    }
    diffTypes = res.types || [];
    diffSummary = res.summary || {};
    // Drop selections that no longer exist
    const known = new Set(diffTypes.map((t) => String(t.id)));
    for (const id of Array.from(selected)) {
      if (!known.has(id)) selected.delete(id);
    }
    renderSummary();
    renderTable();
    status(
      `Diff ready — ${diffSummary.types || 0} types (WMS catalog ${
        res.wmsCount ?? "?"
      })`,
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
    await refreshDiff();
  }

  function selectedOrMatching(statusKey) {
    if (selected.size) {
      return Array.from(selected);
    }
    return (diffTypes || [])
      .filter((t) => t && t.status === statusKey)
      .map((t) => String(t.id));
  }

  function selectedInstructionDiffIds() {
    if (selected.size) {
      return Array.from(selected);
    }
    return (diffTypes || [])
      .filter((t) => typeHasInstructionDiff(t))
      .map((t) => String(t.id));
  }

  function openConfirm(title, html, action) {
    confirmAction = action;
    els.confirmTitle.textContent = title;
    els.confirmBody.innerHTML = html;
    if (confirmModal) confirmModal.show();
    else if (window.confirm(title + "\n\nContinue?")) action();
  }

  async function runPush() {
    const typeIds = selectedOrMatching("missing_in_wms");
    if (!typeIds.length) {
      return status("Nothing to push — select types or filter Missing in WMS", "error");
    }
    status("Planning push (dry run)...");
    const includeInstructions = !!els.includeInstructions.checked;
    const planRes = await api("vas_sync_push", {
      org,
      token,
      config: draftPayload(),
      typeIds,
      includeInstructions,
      dryRun: true
    });
    if (!planRes.success) {
      return status(planRes.error || "Push plan failed", "error");
    }
    const createN = planRes.summary?.create ?? 0;
    const skipN = planRes.summary?.skip ?? 0;
    const lines = (planRes.plan || [])
      .map((p) => {
        if (p.action === "create") {
          return `<li><strong>${esc(p.id)}</strong> — create (${p.stepCount || 0} steps)</li>`;
        }
        const missing = (p.missingSteps || []).join(", ") || "none";
        return `<li><strong>${esc(p.id)}</strong> — skip (exists). Missing steps: ${esc(
          missing
        )} — use Push instructions (merge) for instruction updates</li>`;
      })
      .join("");

    openConfirm(
      "Push missing to WMS",
      `<p>Create <strong>${createN}</strong>, skip <strong>${skipN}</strong>${
        includeInstructions ? " (with instructions)" : " (no instructions)"
      }.</p>
       <p class="mb-0 small text-muted">Existing ProvidedServiceIds are never updated here — only brand-new types are created.</p>
       <ul class="confirm-plan-list">${lines || "<li>Nothing</li>"}</ul>`,
      async () => {
        status("Pushing to WMS...");
        const res = await api("vas_sync_push", {
          org,
          token,
          config: draftPayload(),
          typeIds,
          includeInstructions,
          dryRun: false
        });
        if (!res.success) {
          return status(res.error || "Push failed", "error");
        }
        const created = (res.created || []).length;
        const skipped = (res.skipped || []).length;
        const failed = (res.failed || []).length;
        status(
          `Push done — created ${created}, skipped ${skipped}, failed ${failed}`,
          failed ? "error" : "success"
        );
        await refreshDiff();
      }
    );
  }

  async function runPushInstructions() {
    const typeIds = selectedInstructionDiffIds();
    if (!typeIds.length) {
      return status(
        "Nothing to merge — select types (or filter Instructions differ)",
        "error"
      );
    }
    status("Planning instruction merge (dry run)...");
    const planRes = await api("vas_sync_push_instructions", {
      org,
      token,
      config: draftPayload(),
      typeIds,
      dryRun: true
    });
    if (!planRes.success) {
      return status(planRes.error || "Instruction merge plan failed", "error");
    }
    const mergeN = planRes.summary?.merge ?? 0;
    const skipN = planRes.summary?.skip ?? 0;
    const lines = (planRes.plan || [])
      .map((p) => {
        if (p.action === "merge_instructions") {
          const steps = (p.stepsUpdated || []).join(", ") || "none";
          const missing = (p.stepsMissingInWms || []).join(", ");
          return `<li><strong>${esc(p.id)}</strong> — merge ${
            p.instructionCount || 0
          } instruction(s) on steps: ${esc(steps)}${
            missing ? `; steps missing in WMS: ${esc(missing)}` : ""
          } (${p.instructionSaveCount || 0} instruction/save)</li>`;
        }
        return `<li><strong>${esc(p.id)}</strong> — skip (${esc(
          p.reason || p.message || "n/a"
        )})</li>`;
      })
      .join("");

    openConfirm(
      "Push instructions (merge)",
      `<p>Merge instructions for <strong>${mergeN}</strong> existing type(s), skip <strong>${skipN}</strong>.</p>
       <p class="mb-0 small text-muted">Searches each ProvidedService, replaces StepInstruction lists from config, then saves one full merged payload (plus instruction/save for new ids).</p>
       <ul class="confirm-plan-list">${lines || "<li>Nothing</li>"}</ul>`,
      async () => {
        status("Merging instructions into WMS...");
        const res = await api("vas_sync_push_instructions", {
          org,
          token,
          config: draftPayload(),
          typeIds,
          dryRun: false
        });
        if (!res.success) {
          return status(res.error || "Instruction merge failed", "error");
        }
        const updated = (res.updated || []).length;
        const skipped = (res.skipped || []).length;
        const failed = (res.failed || []).length;
        status(
          `Instruction merge done — updated ${updated}, skipped ${skipped}, failed ${failed}`,
          failed ? "error" : "success"
        );
        await refreshDiff();
      }
    );
  }

  async function runPull() {
    const typeIds = selectedOrMatching("missing_in_config");
    // Also allow selecting aligned types that only need step pull — if selected, pass them
    const ids = selected.size ? Array.from(selected) : typeIds;
    if (!ids.length && !selected.size) {
      // Let API choose defaults (missing types + types with missing steps)
    }
    const body = {
      org,
      token,
      config: draftPayload()
    };
    if (selected.size) body.typeIds = Array.from(selected);

    openConfirm(
      "Pull missing into draft",
      selected.size
        ? `<p>Pull selected <strong>${selected.size}</strong> type(s) from WMS into the local draft.</p>
           <p class="small text-muted mb-0">Then use Save &amp; Deploy to commit to GitHub.</p>`
        : `<p>Pull all WMS-only types (and missing steps) into the local draft.</p>
           <p class="small text-muted mb-0">Then use Save &amp; Deploy to commit to GitHub.</p>`,
      async () => {
        status("Pulling from WMS into draft...");
        const res = await api("vas_sync_pull", body);
        if (!res.success) {
          return status(res.error || "Pull failed", "error");
        }
        draft = VasConfig.normalizeConfig(res.config);
        const n = (res.pulled || []).length;
        status(
          n
            ? `Pulled ${n} change(s) into local draft — Save & Deploy when ready`
            : "Nothing new to pull",
          "success"
        );
        await refreshDiff();
      }
    );
  }

  async function runSave() {
    if (!draft || !org || !token) return;
    if (!confirm("Save draft to GitHub and deploy?")) return;
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
  }

  // Events
  document.querySelectorAll(".sync-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".sync-filter")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filter = btn.dataset.filter || "all";
      renderTable();
    });
  });

  els.diffBody.addEventListener("click", (e) => {
    const expandInstr = e.target.closest("[data-expand-instr]");
    if (expandInstr) {
      const key = expandInstr.getAttribute("data-expand-instr");
      if (expandedInstr.has(key)) expandedInstr.delete(key);
      else expandedInstr.add(key);
      renderTable();
      return;
    }
    const expandBtn = e.target.closest("[data-expand]");
    if (expandBtn) {
      const id = expandBtn.getAttribute("data-expand");
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      renderTable();
      return;
    }
    const check = e.target.closest(".type-check");
    if (check) {
      const id = check.getAttribute("data-id");
      if (check.checked) selected.add(id);
      else selected.delete(id);
      updateSelectionHint();
      return;
    }
    const row = e.target.closest(".sync-type-row");
    if (row && !e.target.closest("input")) {
      const id = row.dataset.typeId;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      renderTable();
    }
  });

  els.selectAllVisible.addEventListener("change", () => {
    const vis = visibleTypes();
    if (els.selectAllVisible.checked) {
      vis.forEach((t) => selected.add(String(t.id)));
    } else {
      vis.forEach((t) => selected.delete(String(t.id)));
    }
    renderTable();
  });

  els.refreshBtn.onclick = async () => {
    await loadDraft();
    await refreshDiff();
  };
  els.pushBtn.onclick = () => runPush();
  if (els.pushInstrBtn) els.pushInstrBtn.onclick = () => runPushInstructions();
  els.pullBtn.onclick = () => runPull();
  els.saveBtn.onclick = () => runSave();

  els.confirmOkBtn.onclick = async () => {
    const action = confirmAction;
    confirmAction = null;
    if (confirmModal) confirmModal.hide();
    if (typeof action === "function") await action();
  };

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
      org: String(ci.org || ci.organization || "").trim()
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
