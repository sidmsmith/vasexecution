(function () {
  const VasConfig = window.VasConfig;
  let token = null;
  let org = null;
  let defaultsDoc = null;
  /** Effective config used for diffing: local (unsaved) draft when present, else deployed. */
  let draft = null;
  /** Freshly-fetched deployed doc (defaults + org overlay) — always the real, live-pushable state. */
  let deployedDraft = null;
  /** True when `draft` came from localStorage rather than the deployed JSON files. */
  let usingLocalDraft = false;
  /** @type {Array|null} */
  let diffTypes = null;
  /** @type {"all"|"wms"|"config"|"deploy"|"aligned"} */
  let activeCategory = "all";
  /** @type {Set<string>} */
  const selected = new Set();
  /** @type {Set<string>} */
  const expanded = new Set();
  let confirmAction = null;

  /**
   * Instruction-diff statuses that unambiguously mean a gap in one specific
   * direction. Deliberately excludes "instructions_differ" — the backend
   * uses that as a catch-all whenever both sides have text but the lists
   * don't match exactly (config has extra, WMS has extra, reordered,
   * reworded, ...), so it doesn't imply a gap in either specific direction.
   * Directionality is determined precisely by the per-text helpers below.
   */
  const PUSH_INSTR_STATUSES = new Set(["instructions_missing_in_wms"]);
  const PULL_INSTR_STATUSES = new Set(["instructions_missing_in_config"]);
  /** Any instruction-level diff at all (direction-agnostic) — used only to decide push-merge eligibility, never for display. */
  const INSTR_DIFF_STATUSES = new Set([
    "instructions_differ",
    "instructions_missing_in_wms",
    "instructions_missing_in_config"
  ]);

  const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));
  const els = {
    orgSection: document.getElementById("orgSection"),
    orgInput: document.getElementById("org"),
    orgBtn: document.getElementById("orgBtn"),
    mainUI: document.getElementById("mainUI"),
    status: document.getElementById("status"),
    attentionStrip: document.getElementById("attentionStrip"),
    diffBody: document.getElementById("diffBody"),
    emptyState: document.getElementById("emptyState"),
    selectAllVisible: document.getElementById("selectAllVisible"),
    selectionHint: document.getElementById("selectionHint"),
    includeInstructions: document.getElementById("includeInstructions"),
    expandAllBtn: document.getElementById("expandAllBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    pushBtn: document.getElementById("pushBtn"),
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

  function entriesEqual(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  }

  /** Read the Admin page's autosaved draft for this org, if any. */
  function readLocalDraft() {
    if (!org) return null;
    try {
      const raw = localStorage.getItem(`vas_draft:${org}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Write the current draft to the same localStorage key Admin autosaves to
   * (same shape as Admin's persistDraftLocal), so a pull is immediately
   * visible in Admin and reflected as "not yet deployed" here — without
   * this, a pull only lived in this page's in-memory draft and vanished on
   * navigation/reload unless Save & Deploy was clicked from this exact page.
   */
  function persistDraftLocal() {
    if (!org || !draft) return;
    try {
      localStorage.setItem(
        `vas_draft:${org}`,
        JSON.stringify({
          version: draft.version || 1,
          vasTypes: draft.vasTypes,
          items: draft.items,
          savedAt: new Date().toISOString()
        })
      );
    } catch {
      // Private browsing / quota exceeded — degrade silently, pull still works this session.
    }
  }

  /** Type exists in WMS or config but the effective (local) draft hasn't been deployed yet. */
  function typeNotYetDeployed(t) {
    if (!t || !usingLocalDraft) return false;
    const id = String(t.id);
    return !entriesEqual(
      draft && draft.vasTypes && draft.vasTypes[id],
      deployedDraft && deployedDraft.vasTypes && deployedDraft.vasTypes[id]
    );
  }

  /** Type existed in the last-deployed config but has been removed from the local draft. */
  function typeDeletedInConfig(t) {
    if (!t || !usingLocalDraft) return false;
    return !!VasConfig.getTypeConfig(deployedDraft, t.id) && !VasConfig.getTypeConfig(draft, t.id);
  }

  /** Step existed in the last-deployed config but has been removed from the local draft. */
  function stepDeletedInConfig(typeId, stepId) {
    if (!usingLocalDraft) return false;
    return stepConfigExists(deployedDraft, typeId, stepId) && !stepConfigExists(draft, typeId, stepId);
  }

  function badge(statusKey, label) {
    const text = label || String(statusKey || "").replace(/_/g, " ");
    return `<span class="sync-badge sync-badge-${esc(statusKey)}">${esc(text)}</span>`;
  }

  function normalizeInstrText(text) {
    return String(text ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Merge two instruction-text lists into one ordered view: config lines
   * first (marked "both" or "config-only"), then any WMS-only lines
   * appended (matched by normalized-text membership — not a positional/LCS
   * diff, just set membership, same semantics as the backend's
   * _compare_instruction_lists).
   */
  function unifiedDiffLines(configTexts, wmsTexts) {
    const cfg = Array.isArray(configTexts) ? configTexts : [];
    const wms = Array.isArray(wmsTexts) ? wmsTexts : [];
    const wmsNorm = new Set(wms.map(normalizeInstrText).filter(Boolean));
    const cfgNorm = new Set(cfg.map(normalizeInstrText).filter(Boolean));
    const lines = cfg.map((text) => ({
      text,
      kind: wmsNorm.has(normalizeInstrText(text)) ? "both" : "config-only"
    }));
    wms.forEach((text) => {
      if (!cfgNorm.has(normalizeInstrText(text))) {
        lines.push({ text, kind: "wms-only" });
      }
    });
    return lines;
  }

  /** Config instruction texts absent from WMS (push-direction text gap). */
  function stepHasConfigTextsMissingInWms(step) {
    if (!step) return false;
    if (PUSH_INSTR_STATUSES.has(step.instructionStatus)) return true;
    return unifiedDiffLines(step.configInstructions, step.wmsInstructions).some(
      (l) => l.kind === "config-only"
    );
  }

  /** WMS instruction texts absent from config (pull-direction text gap). */
  function stepHasWmsTextsMissingInConfig(step) {
    if (!step) return false;
    if (PULL_INSTR_STATUSES.has(step.instructionStatus)) return true;
    return unifiedDiffLines(step.configInstructions, step.wmsInstructions).some(
      (l) => l.kind === "wms-only"
    );
  }

  /** Type or any step absent from WMS, or has a push-direction text gap. Always includes instruction-level gaps. */
  function typeNeedsPushToWms(t) {
    if (!t) return false;
    if (t.status === "missing_in_wms") return true;
    return (Array.isArray(t.steps) ? t.steps : []).some(
      (s) => s && (s.status === "missing_in_wms" || stepHasConfigTextsMissingInWms(s))
    );
  }

  /** Type or any step absent from config, or has a pull-direction text gap. Always includes instruction-level gaps. */
  function typeNeedsPullToConfig(t) {
    if (!t) return false;
    if (t.status === "missing_in_config") return true;
    return (Array.isArray(t.steps) ? t.steps : []).some(
      (s) => s && (s.status === "missing_in_config" || stepHasWmsTextsMissingInConfig(s))
    );
  }

  /** Any instruction-level diff at all (direction-agnostic) — push-merge eligibility only, not display. */
  function typeHasInstructionDiff(t) {
    if (!t) return false;
    if (INSTR_DIFF_STATUSES.has(t.instructionStatus)) return true;
    return (Array.isArray(t.steps) ? t.steps : []).some((s) =>
      INSTR_DIFF_STATUSES.has(s && s.instructionStatus)
    );
  }

  /** Any step absent from WMS on a type that itself exists in WMS — push-merge eligibility only. */
  function typeHasStepsMissingInWms(t) {
    if (!t) return false;
    return (Array.isArray(t.steps) ? t.steps : []).some(
      (s) => s && s.status === "missing_in_wms"
    );
  }

  /**
   * "Aligned" means exactly one thing, everywhere: no gap in either
   * direction, and deployed. `t.status` only tells you the type/step itself
   * exists on both sides — that's necessary but not sufficient, so display
   * code should never render it directly; use this (or typeStatusHtml)
   * instead, so a row can never say "Aligned" while something is missing.
   */
  function isAligned(t) {
    return !!(
      t &&
      t.status === "aligned" &&
      !typeNeedsPushToWms(t) &&
      !typeNeedsPullToConfig(t) &&
      !t.notYetDeployed
    );
  }

  /** "missing in WMS", "missing in config, missing in WMS", "not present", or "aligned". */
  function describeGapState(t) {
    if (t && t.status === "deleted_only") return "not present";
    const parts = [];
    if (typeNeedsPushToWms(t)) parts.push("missing in WMS");
    if (typeNeedsPullToConfig(t)) parts.push("missing in config");
    return parts.length ? parts.join(", ") : "aligned";
  }

  /**
   * Full status markup. Deleted-in-config takes visual priority over the
   * generic not-deployed badge (a deleted type is always not-yet-deployed
   * too — this is a strict specialization, not a suppression of separately
   * true information). Otherwise: the Missing in WMS/config badge is
   * reserved for a genuine presence gap (t.status) — same reasoning as
   * stepGapBadge(). A type that exists on both sides but has only an
   * instruction-level text gap still counts toward the Missing in WMS/config
   * tiles (a push/pull is still needed) but doesn't get badged as if the
   * type itself were absent; gapNote() already conveys that case in plain
   * language ("instruction → WMS").
   */
  function typeStatusHtml(t) {
    if (t && typeDeletedInConfig(t)) {
      return `${badge("deleted_in_config", "deleted in config")} <span class="sync-status-secondary">(WMS: ${esc(
        describeGapState(t)
      )})</span>`;
    }
    if (t && t.notYetDeployed) {
      return `${badge("not_deployed", "not deployed")} <span class="sync-status-secondary">(WMS: ${esc(
        describeGapState(t)
      )})</span>`;
    }
    if (t.status === "missing_in_wms") return badge("missing_in_wms");
    if (t.status === "missing_in_config") return badge("missing_in_config");
    if (isAligned(t)) return badge("aligned");
    return "";
  }

  /** Per-step equivalent of typeStatusHtml — never a generic label when a step is actually missing something. */
  /**
   * Reserved for a genuine presence gap — the step itself missing from one
   * side. An instruction-only text gap (step exists on both sides, just some
   * lines don't match) is deliberately NOT badged here: showing the same
   * Missing in WMS/config badge for both cases made an aligned step with one
   * mismatched line look like it didn't exist in WMS at all. The diff lines
   * below already carry per-line missing-in-X tags for that case; see
   * stepGapNote() for the step-title-level summary of it.
   */
  function stepGapBadge(step) {
    if (!step) return "";
    if (step.status === "missing_in_wms") return badge("missing_in_wms");
    if (step.status === "missing_in_config") return badge("missing_in_config");
    return "";
  }

  /** Plain-language instruction-gap summary for a step that exists on both sides. */
  function stepGapNote(step) {
    if (!step || step.status === "missing_in_wms" || step.status === "missing_in_config") return "";
    const parts = [];
    if (stepHasConfigTextsMissingInWms(step)) parts.push("instruction → WMS");
    if (stepHasWmsTextsMissingInConfig(step)) parts.push("instruction → config");
    return parts.length ? `<span class="sync-gap-count">${esc(parts.join(" · "))}</span>` : "";
  }

  function typeGapCounts(t) {
    const steps = Array.isArray(t.steps) ? t.steps : [];
    return {
      stepsMissingInWms: steps.filter((s) => s && s.status === "missing_in_wms").length,
      stepsMissingInConfig: steps.filter((s) => s && s.status === "missing_in_config").length
    };
  }

  /**
   * One plain-language note ("2 steps → WMS · instruction → config") instead
   * of stacking badges. Never says "wording differs" — under this diff
   * model a mismatched line is never a fuzzy rewording, it's always "this
   * exact text exists on one side and not the other", so the note says the
   * specific, directional fact instead — kept in sync with
   * typeNeedsPushToWms/typeNeedsPullToConfig so it never disagrees with
   * what the attention strip counts.
   */
  function gapNote(t) {
    if (t.status === "missing_in_wms") return `<span class="sync-gap-count">whole type not in WMS yet</span>`;
    if (t.status === "missing_in_config") return `<span class="sync-gap-count">whole type not in config yet</span>`;
    const gaps = typeGapCounts(t);
    const parts = [];
    if (gaps.stepsMissingInWms) {
      parts.push(`${gaps.stepsMissingInWms} step${gaps.stepsMissingInWms > 1 ? "s" : ""} → WMS`);
    } else if (typeNeedsPushToWms(t)) {
      parts.push("instruction → WMS");
    }
    if (gaps.stepsMissingInConfig) {
      parts.push(`${gaps.stepsMissingInConfig} step${gaps.stepsMissingInConfig > 1 ? "s" : ""} → config`);
    } else if (typeNeedsPullToConfig(t)) {
      parts.push("instruction → config");
    }
    return parts.length ? `<span class="sync-gap-count">${esc(parts.join(" · "))}</span>` : "";
  }

  function warnIconHtml(t) {
    const warnings = Array.isArray(t.warnings) ? t.warnings : [];
    const msgs = warnings
      .map((w) => {
        if (!w) return "";
        if (w.code === "id_whitespace") {
          return `whitespace on ${w.field || "id"}: "${w.raw}"`;
        }
        return w.message || w.code || "";
      })
      .filter(Boolean);
    if (!msgs.length) return "";
    return ` <i class="fa-solid fa-triangle-exclamation sync-warn-icon" title="${esc(
      msgs.join("; ")
    )}"></i>`;
  }

  /** Same warning icon, but only for warnings attributable to this specific step (by trimmed id match). */
  function stepWarnIconHtml(typeWarnings, step) {
    const warnings = Array.isArray(typeWarnings) ? typeWarnings : [];
    const stepId = String((step && step.id) || "").trim();
    const msgs = warnings
      .filter(
        (w) =>
          w &&
          w.field === "ProvidedServiceStepId" &&
          String(w.trimmed || "").trim() === stepId
      )
      .map((w) => `whitespace on ${w.field}: "${w.raw}"`);
    if (!msgs.length) return "";
    return ` <i class="fa-solid fa-triangle-exclamation sync-warn-icon" title="${esc(
      msgs.join("; ")
    )}"></i>`;
  }

  // --- Step/line-level "not deployed" (draft vs. deployed, same mechanism
  // used for draft vs. WMS, just pointed at a different second source).
  // Both docs are already fully loaded normalized config objects. ---

  function stepConfigTexts(configDoc, typeId, stepId) {
    if (!configDoc) return [];
    const typeCfg = VasConfig.getTypeConfig(configDoc, typeId);
    const stepCfg = VasConfig.getStepConfig(typeCfg, stepId);
    if (!stepCfg || !Array.isArray(stepCfg.content)) return [];
    return stepCfg.content
      .filter((b) => b && b.type !== "image" && b.text)
      .map((b) => b.text);
  }

  function stepConfigExists(configDoc, typeId, stepId) {
    if (!configDoc) return false;
    const typeCfg = VasConfig.getTypeConfig(configDoc, typeId);
    return !!VasConfig.getStepConfig(typeCfg, stepId);
  }

  function stepDeployDiffLines(typeId, stepId) {
    if (!usingLocalDraft) return [];
    return unifiedDiffLines(
      stepConfigTexts(draft, typeId, stepId),
      stepConfigTexts(deployedDraft, typeId, stepId)
    );
  }

  /** Whole step added/removed locally, or has any instruction line not yet deployed. */
  function stepHasUndeployedChange(typeId, stepId) {
    if (!usingLocalDraft) return false;
    const inDraft = stepConfigExists(draft, typeId, stepId);
    const inDeployed = stepConfigExists(deployedDraft, typeId, stepId);
    if (inDraft !== inDeployed) return true;
    if (!inDraft) return false;
    return stepDeployDiffLines(typeId, stepId).some((l) => l.kind !== "both");
  }

  /** Normalized texts present in the draft but not yet deployed, for one step. */
  function stepUndeployedTextSet(typeId, stepId) {
    const set = new Set();
    if (!usingLocalDraft) return set;
    stepDeployDiffLines(typeId, stepId)
      .filter((l) => l.kind === "config-only")
      .forEach((l) => set.add(normalizeInstrText(l.text)));
    return set;
  }

  function diffLinesHtml(step, typeId) {
    const configTexts = (step && step.configInstructions) || [];
    const wmsTexts = (step && step.wmsInstructions) || [];
    const lines = unifiedDiffLines(configTexts, wmsTexts);

    // Lines removed from the draft since the last deploy (draft-vs-deployed
    // "wms-only" here means "present in deployedDraft, absent from draft" —
    // i.e. deleted locally). Merge in any not already visible via the
    // WMS-relative diff above (deleted-and-never-in-WMS lines are otherwise
    // completely invisible, since they're absent from both input arrays).
    const deployDiff = stepDeployDiffLines(typeId, step && step.id);
    const deletedLines = deployDiff.filter((l) => l.kind === "wms-only");
    const deletedNorm = new Set(deletedLines.map((l) => normalizeInstrText(l.text)));
    const existingNorm = new Set(lines.map((l) => normalizeInstrText(l.text)));
    deletedLines.forEach((l) => {
      const norm = normalizeInstrText(l.text);
      if (existingNorm.has(norm)) return; // already visible below; gets the deleted tag added instead
      lines.push({ text: l.text, kind: "deleted-only" });
      existingNorm.add(norm);
    });

    if (!lines.length) {
      return `<div class="diff-empty">No instructions on either side.</div>`;
    }
    const undeployedNorm = stepUndeployedTextSet(typeId, step && step.id);
    return `<ul class="diff-lines">${lines
      .map((l) => {
        const mark =
          l.kind === "config-only" ? "+" : l.kind === "wms-only" || l.kind === "deleted-only" ? "−" : "";
        const wmsTag =
          l.kind === "config-only"
            ? "missing in WMS"
            : l.kind === "wms-only"
              ? "missing in config"
              : "";
        // A wms-only/deleted-only line can't also be a locally-added draft
        // line, so no undeployed check is needed for it.
        const isUndeployed =
          l.kind !== "wms-only" && l.kind !== "deleted-only" && undeployedNorm.has(normalizeInstrText(l.text));
        // Deleted takes priority when both would otherwise apply — it never
        // actually can (deleted lines are, by definition, absent from the
        // draft, so isUndeployed is always false for them), but the guard
        // documents the intended precedence.
        const isDeleted = deletedNorm.has(normalizeInstrText(l.text));
        return `<li class="diff-line diff-line-${l.kind}">
          <span class="diff-gutter">${mark}</span>
          <span class="diff-text">${esc(l.text)}</span>
          <span class="diff-tags">
            ${wmsTag ? `<span class="diff-tag">${wmsTag}</span>` : ""}
            ${isDeleted ? '<span class="diff-tag diff-tag-deleted">deleted in config</span>' : ""}
            ${!isDeleted && isUndeployed ? '<span class="diff-tag diff-tag-not-deployed">not deployed</span>' : ""}
          </span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function stepDiffBlockHtml(step, typeId, typeWarnings) {
    const deleted = stepDeletedInConfig(typeId, step.id);
    const notDeployedBadge =
      !deleted && stepHasUndeployedChange(typeId, step.id) ? ` ${badge("not_deployed", "not deployed")}` : "";
    const deletedBadge = deleted ? ` ${badge("deleted_in_config", "deleted in config")}` : "";
    const gapBadge = stepGapBadge(step);
    const gapNoteHtml = stepGapNote(step);
    const warnIcon = stepWarnIconHtml(typeWarnings, step);
    return `<div class="mb-2">
      <div class="sync-step-title">${esc(step.id)}${warnIcon}${gapBadge ? " " + gapBadge : ""}${deletedBadge}${notDeployedBadge}${gapNoteHtml ? " " + gapNoteHtml : ""}</div>
      ${diffLinesHtml(step, typeId)}
    </div>`;
  }

  function stepDiffListHtml(t) {
    return (Array.isArray(t.steps) ? t.steps : [])
      .map((s) => stepDiffBlockHtml(s, t.id, t.warnings))
      .join("");
  }

  function draftPayload() {
    return {
      version: draft.version || 1,
      vasTypes: draft.vasTypes,
      items: draft.items
    };
  }

  // --- Attention strip (single-select) ---

  function categoryCounts() {
    const list = Array.isArray(diffTypes) ? diffTypes : [];
    return {
      all: list.length,
      wms: list.filter((t) => typeNeedsPushToWms(t)).length,
      config: list.filter((t) => typeNeedsPullToConfig(t)).length,
      deploy: list.filter((t) => t.notYetDeployed).length,
      aligned: list.filter(isAligned).length
    };
  }

  function visibleTypes() {
    const list = Array.isArray(diffTypes) ? diffTypes : [];
    if (activeCategory === "wms") return list.filter((t) => typeNeedsPushToWms(t));
    if (activeCategory === "config") return list.filter((t) => typeNeedsPullToConfig(t));
    if (activeCategory === "deploy") return list.filter((t) => t.notYetDeployed);
    if (activeCategory === "aligned") return list.filter(isAligned);
    return list; // "all"
  }

  function renderStrip() {
    if (!els.attentionStrip) return;
    const c = categoryCounts();
    const cards = [
      ["all", "card-all", c.all, "All"],
      ["wms", "card-wms", c.wms, "Missing in WMS"],
      ["config", "card-config", c.config, "Missing in config"],
      ["deploy", "card-deploy", c.deploy, "Not deployed"],
      ["aligned", "card-aligned", c.aligned, "Aligned"]
    ];
    els.attentionStrip.innerHTML = cards
      .map(
        ([key, cls, count, label]) => `
      <button type="button" class="attention-card ${cls}${activeCategory === key ? " active" : ""}" data-cat="${key}">
        <div class="count">${count}</div>
        <div class="label">${esc(label)}</div>
      </button>`
      )
      .join("");
    els.attentionStrip.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.onclick = () => {
        activeCategory = btn.dataset.cat;
        renderAll();
      };
    });
  }

  function allVisibleExpanded() {
    const vis = visibleTypes();
    return vis.length > 0 && vis.every((t) => expanded.has(String(t.id)));
  }

  function renderExpandAllBtn() {
    if (!els.expandAllBtn) return;
    els.expandAllBtn.textContent = allVisibleExpanded() ? "Collapse all" : "Expand all";
  }

  function renderTable() {
    const rows = visibleTypes();
    renderExpandAllBtn();
    els.emptyState.hidden = rows.length > 0;
    els.diffBody.innerHTML = rows
      .map((t) => {
        const id = String(t.id || "");
        const isOpen = expanded.has(id);
        const steps = Array.isArray(t.steps) ? t.steps : [];
        const detailRow = isOpen
          ? `<tr class="sync-instr-row">
              <td></td>
              <td></td>
              <td colspan="3">${stepDiffListHtml(t)}</td>
            </tr>`
          : "";
        return `<tr class="sync-type-row" data-type-id="${esc(id)}">
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
          </td>
          <td>
            <span class="sync-type-id">${esc(id)}</span>${warnIconHtml(t)}
            <span class="sync-type-title">${esc(t.title || "")}</span>
          </td>
          <td><div class="sync-row-status">${typeStatusHtml(t)}${gapNote(t)}</div></td>
          <td>${steps.length}</td>
        </tr>${detailRow}`;
      })
      .join("");
    updateActionButtonState();
  }

  function renderAll() {
    renderStrip();
    renderTable();
  }

  async function loadDraft() {
    const bust = `?t=${Date.now()}`;
    const defaultsRaw = await fetchJson(`/config/vas.default.json${bust}`);
    if (!defaultsRaw) {
      status("Could not load /config/vas.default.json", "error");
      draft = VasConfig.emptyConfig();
      deployedDraft = draft;
      usingLocalDraft = false;
      return;
    }
    defaultsDoc = VasConfig.normalizeConfig(defaultsRaw);
    const orgDoc = await fetchJson(
      `/config/orgs/${encodeURIComponent(org)}.json${bust}`
    );
    deployedDraft = orgDoc
      ? VasConfig.mergeVasConfigs(defaultsDoc, orgDoc)
      : VasConfig.normalizeConfig(JSON.parse(JSON.stringify(defaultsDoc)));

    const localRaw = readLocalDraft();
    const localNormalized = localRaw ? VasConfig.normalizeConfig(localRaw) : null;
    if (
      localNormalized &&
      JSON.stringify(localNormalized) !== JSON.stringify(deployedDraft)
    ) {
      draft = localNormalized;
      usingLocalDraft = true;
    } else {
      draft = deployedDraft;
      usingLocalDraft = false;
    }
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
    diffTypes.forEach((t) => {
      if (t) t.notYetDeployed = typeNotYetDeployed(t);
    });

    // Types/steps deleted from the local draft but never pushed to WMS are
    // invisible to the backend diff above (it only reports the union of
    // submitted-draft ids and live-WMS ids) — synthesize display rows for
    // them from the already-loaded deployedDraft so they still show up,
    // tagged "deleted in config" instead of silently vanishing.
    if (usingLocalDraft && deployedDraft) {
      const knownTypeIds = new Set(diffTypes.map((t) => String(t.id)));
      Object.keys(deployedDraft.vasTypes || {}).forEach((id) => {
        if (knownTypeIds.has(id) || VasConfig.getTypeConfig(draft, id)) return;
        diffTypes.push({
          id,
          status: "deleted_only",
          instructionStatus: null,
          title: (VasConfig.getTypeConfig(deployedDraft, id) || {}).title || id,
          steps: [],
          warnings: [],
          notYetDeployed: true
        });
        knownTypeIds.add(id);
      });

      diffTypes.forEach((t) => {
        const typeCfg = VasConfig.getTypeConfig(deployedDraft, t.id);
        const deployedStepIds = typeCfg ? VasConfig.orderedStepIds(typeCfg) : [];
        if (!deployedStepIds.length) return;
        if (!Array.isArray(t.steps)) t.steps = [];
        const knownStepIds = new Set(t.steps.map((s) => String(s.id)));
        deployedStepIds.forEach((stepId) => {
          if (knownStepIds.has(stepId)) return;
          t.steps.push({
            id: stepId,
            status: "deleted_only",
            instructionStatus: null,
            configInstructions: [],
            wmsInstructions: []
          });
          knownStepIds.add(stepId);
        });
      });
    }

    // Drop selections that no longer exist
    const known = new Set(diffTypes.map((t) => String(t.id)));
    for (const id of Array.from(selected)) {
      if (!known.has(id)) selected.delete(id);
    }
    renderAll();
    status(
      usingLocalDraft
        ? `Diff ready (against unsaved local draft) — ${diffTypes.length} types (WMS catalog ${res.wmsCount ?? "?"})`
        : `Diff ready — ${diffTypes.length} types (WMS catalog ${res.wmsCount ?? "?"})`,
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
    const adminLink = document.getElementById("adminNavLink");
    if (adminLink) adminLink.href = `/admin.html?org=${encodeURIComponent(org)}`;
    await loadDraft();
    await refreshDiff();
  }

  function typeById(typeId) {
    return (diffTypes || []).find((t) => t && String(t.id) === String(typeId));
  }

  function typeExistsInWms(t) {
    return !!(t && t.status !== "missing_in_wms");
  }

  function includeInstructionsChecked() {
    return !!(els.includeInstructions && els.includeInstructions.checked);
  }

  /** Create targets: selected types that are missing_in_wms. */
  function pushCreateIds() {
    return Array.from(selected).filter((id) => {
      const t = typeById(id);
      return t && t.status === "missing_in_wms";
    });
  }

  /**
   * Merge targets when "Also merge instruction text when pushing" is
   * checked: selected existing types with instruction diffs and/or steps
   * missing from WMS. A type that exists in WMS but is missing one of its
   * steps still qualifies — the merge call creates that step.
   */
  function pushMergeIds() {
    const needsMerge = (t) => typeHasInstructionDiff(t) || typeHasStepsMissingInWms(t);
    return Array.from(selected)
      .map((id) => typeById(id))
      .filter(Boolean)
      .filter((t) => typeExistsInWms(t) && t.status !== "missing_in_config" && needsMerge(t))
      .map((t) => String(t.id));
  }

  /** Any currently-selected type has unsaved local changes not yet deployed. */
  function selectionHasUndeployed() {
    if (!selected.size) return false;
    return Array.from(selected).some((id) => {
      const t = typeById(id);
      return !!(t && t.notYetDeployed);
    });
  }

  /** Grey (secondary) when disabled — solid blue with white text/icon when enabled. */
  function actionButtonClass(enabled) {
    return `btn btn-sm ${enabled ? "btn-primary" : "btn-secondary"}`;
  }

  /**
   * Push/Pull require an explicit selection (checkbox or Select all
   * visible) — no more "empty selection = act on everything eligible".
   * Each button independently enables only if the current selection
   * actually has something for it to do in that direction, and both stay
   * disabled if the selection includes anything not yet deployed.
   */
  function updateActionButtonState() {
    const n = selected.size;
    els.selectionHint.textContent = n ? `${n} type${n === 1 ? "" : "s"} selected` : "";
    const vis = visibleTypes();
    els.selectAllVisible.checked =
      vis.length > 0 && vis.every((t) => selected.has(String(t.id)));

    const selectedTypes = Array.from(selected).map(typeById).filter(Boolean);
    const blocked = selectionHasUndeployed();
    const pushEnabled = n > 0 && !blocked && selectedTypes.some((t) => typeNeedsPushToWms(t));
    const pullEnabled = n > 0 && !blocked && selectedTypes.some((t) => typeNeedsPullToConfig(t));
    const title = blocked
      ? "Selected type(s) have unsaved local changes — Save & Deploy in Admin first, or deselect them"
      : n === 0
        ? "Select at least one type (or Select all visible)"
        : "";

    if (els.pushBtn) {
      els.pushBtn.className = actionButtonClass(pushEnabled);
      els.pushBtn.disabled = !pushEnabled;
      els.pushBtn.title = title;
    }
    if (els.pullBtn) {
      els.pullBtn.className = actionButtonClass(pullEnabled);
      els.pullBtn.disabled = !pullEnabled;
      els.pullBtn.title = title;
    }
  }

  function openConfirm(title, html, action) {
    confirmAction = action;
    els.confirmTitle.textContent = title;
    els.confirmBody.innerHTML = html;
    confirmModal.show();
  }

  function formatCreatePlanLine(p) {
    if (p.action === "create") {
      return `<li><strong>${esc(p.id)}</strong> — create (${p.stepCount || 0} steps${
        p.includeInstructions ? `, ${p.instructionCount || 0} instructions` : ""
      })</li>`;
    }
    const missing = (p.missingSteps || []).join(", ") || "none";
    return `<li><strong>${esc(p.id)}</strong> — skip create (already in WMS). Missing steps: ${esc(
      missing
    )}</li>`;
  }

  function formatMergePlanLine(p) {
    if (p.action === "merge_instructions") {
      const steps = (p.stepsUpdated || []).join(", ") || "none";
      const created = (p.stepsCreated || []).join(", ");
      return `<li><strong>${esc(p.id)}</strong> — merge instructions (${
        p.instructionCount || 0
      } on steps: ${esc(steps)}${
        created ? `; steps created in WMS: ${esc(created)}` : ""
      }; ${p.instructionSaveCount || 0} instruction/save)</li>`;
    }
    return `<li><strong>${esc(p.id)}</strong> — skip merge (${esc(
      p.reason || p.message || "n/a"
    )})</li>`;
  }

  async function runPush() {
    if (selectionHasUndeployed()) {
      return status(
        "Selected type(s) have unsaved local changes — Save & Deploy in Admin first, or deselect them",
        "error"
      );
    }
    const includeInstructions = includeInstructionsChecked();
    const createIds = pushCreateIds();
    const mergeIds = includeInstructions ? pushMergeIds() : [];

    if (!createIds.length && !mergeIds.length) {
      return status(
        includeInstructions
          ? "Nothing to push — selected type(s) aren't Missing in WMS and have no instruction/step diffs to merge"
          : "Nothing to push — selected type(s) aren't Missing in WMS (check \"Also merge instruction text\" to also sync instruction/step diffs)",
        "error"
      );
    }

    status("Planning push (dry run)...");
    let createPlan = [];
    let mergePlan = [];
    let createSummary = { create: 0, skip: 0 };
    let mergeSummary = { merge: 0, skip: 0 };

    if (createIds.length) {
      const planRes = await api("vas_sync_push", {
        org,
        token,
        config: draftPayload(),
        typeIds: createIds,
        includeInstructions,
        dryRun: true
      });
      if (!planRes.success) {
        return status(planRes.error || "Push plan failed", "error");
      }
      createPlan = planRes.plan || [];
      createSummary = planRes.summary || createSummary;
    }

    if (mergeIds.length) {
      const planRes = await api("vas_sync_push_instructions", {
        org,
        token,
        config: draftPayload(),
        typeIds: mergeIds,
        dryRun: true
      });
      if (!planRes.success) {
        return status(planRes.error || "Instruction merge plan failed", "error");
      }
      mergePlan = planRes.plan || [];
      mergeSummary = planRes.summary || mergeSummary;
    }

    const createN = createSummary.create ?? 0;
    const mergeN = mergeSummary.merge ?? 0;
    const skipN = (createSummary.skip ?? 0) + (mergeSummary.skip ?? 0);
    const lines = [
      ...createPlan.map(formatCreatePlanLine),
      ...mergePlan.map(formatMergePlanLine)
    ].join("");

    const note = includeInstructions
      ? "Creates missing types with full instructions, and on existing types merges StepInstruction lists and creates any steps missing from WMS."
      : "Creates missing types only (no merge). Check \"Also merge instruction text\" to also sync instruction diffs and missing steps on existing types.";

    openConfirm(
      "Push to WMS",
      `<p>Create <strong>${createN}</strong>, merge instructions <strong>${mergeN}</strong>, skip <strong>${skipN}</strong>${
        includeInstructions ? " (instructions included)" : " (instructions off)"
      }.</p>
       <p class="mb-0 small text-muted">${note}</p>
       <ul class="confirm-plan-list">${lines || "<li>Nothing</li>"}</ul>`,
      async () => {
        status("Pushing to WMS...");
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;

        if (createIds.length) {
          const res = await api("vas_sync_push", {
            org,
            token,
            config: draftPayload(),
            typeIds: createIds,
            includeInstructions,
            dryRun: false
          });
          if (!res.success) {
            return status(res.error || "Push create failed", "error");
          }
          created += (res.created || []).length;
          skipped += (res.skipped || []).length;
          failed += (res.failed || []).length;
        }

        if (mergeIds.length) {
          const res = await api("vas_sync_push_instructions", {
            org,
            token,
            config: draftPayload(),
            typeIds: mergeIds,
            dryRun: false
          });
          if (!res.success) {
            return status(res.error || "Instruction merge failed", "error");
          }
          updated += (res.updated || []).length;
          skipped += (res.skipped || []).length;
          failed += (res.failed || []).length;
        }

        status(
          `Push done — created ${created}, merged ${updated}, skipped ${skipped}, failed ${failed}`,
          failed ? "error" : "success"
        );
        await refreshDiff();
      }
    );
  }

  function formatPullPlanLine(p) {
    if (p.action === "added_type") {
      const steps = (p.steps || []).join(", ") || "none";
      return `<li><strong>${esc(p.id)}</strong> — add whole type (${(p.steps || []).length} step${
        (p.steps || []).length === 1 ? "" : "s"
      }${p.instructionCount ? `, ${p.instructionCount} instructions` : ""}). Steps: ${esc(steps)}</li>`;
    }
    if (p.action === "added_steps") {
      return `<li><strong>${esc(p.id)}</strong> — add step(s): ${esc((p.steps || []).join(", ") || "none")}</li>`;
    }
    if (p.action === "merged_instructions") {
      const stepLines = (p.stepDetails || [])
        .map(
          (d) =>
            `<li>${esc(d.step)}: ${(d.texts || []).map((t) => `"${esc(t)}"`).join(", ")}</li>`
        )
        .join("");
      return `<li><strong>${esc(p.id)}</strong> — merge ${p.instructionCount || 0} instruction(s) onto step(s): ${esc(
        (p.steps || []).join(", ") || "none"
      )}${stepLines ? `<ul class="confirm-plan-sublist">${stepLines}</ul>` : ""}</li>`;
    }
    if (p.action === "replaced_invalid_entry") {
      return `<li><strong>${esc(p.id)}</strong> — replace invalid local entry with WMS data (${
        (p.steps || []).length
      } steps)</li>`;
    }
    return `<li><strong>${esc(p.id)}</strong> — ${esc(p.action || "update")}</li>`;
  }

  async function runPull() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const body = {
      org,
      token,
      config: draftPayload(),
      typeIds: ids
    };
    status("Checking WMS for what would be pulled...");
    const res = await api("vas_sync_pull", body);
    if (!res.success) {
      return status(res.error || "Pull failed", "error");
    }
    const pulled = res.pulled || [];
    if (!pulled.length) {
      status("Nothing new to pull", "success");
      return;
    }
    const lines = pulled.map(formatPullPlanLine).join("");
    status("");
    openConfirm(
      "Pull missing into draft",
      `<p>Pull will merge <strong>${pulled.length}</strong> change(s) from WMS into the local draft.</p>
       <ul class="confirm-plan-list">${lines}</ul>`,
      async () => {
        draft = VasConfig.normalizeConfig(res.config);
        usingLocalDraft = true;
        persistDraftLocal();
        status(`Pulled ${pulled.length} change(s) into local draft — Save & Deploy when ready`, "success");
        await refreshDiff();
      }
    );
  }

  async function runSave() {
    if (!draft || !org || !token) return;
    if (!(await confirmDialog("Save draft to the cloud and deploy?"))) return;
    status("Saving to the cloud...");
    const payload = {
      version: draft.version || 1,
      updatedAt: new Date().toISOString(),
      vasTypes: draft.vasTypes,
      items: draft.items
    };
    const res = await api("save_vas_config", { org, token, config: payload });
    if (!res.success) return status(res.error || "Save failed", "error");
    deployedDraft = JSON.parse(JSON.stringify(VasConfig.normalizeConfig(draft)));
    persistDraftLocal();
    status(res.message || "Saved", "success");
    await refreshDiff();
  }

  // Events

  els.diffBody.addEventListener("click", (e) => {
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
      updateActionButtonState();
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

  if (els.expandAllBtn) {
    els.expandAllBtn.onclick = () => {
      const vis = visibleTypes();
      if (allVisibleExpanded()) vis.forEach((t) => expanded.delete(String(t.id)));
      else vis.forEach((t) => expanded.add(String(t.id)));
      renderTable();
    };
  }

  els.refreshBtn.onclick = async () => {
    await loadDraft();
    await refreshDiff();
  };

  els.pushBtn.onclick = () => runPush();
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
