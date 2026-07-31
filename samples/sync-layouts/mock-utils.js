(function () {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeText(s) {
    return String(s ?? "").trim().split(/\s+/).filter(Boolean).join(" ");
  }

  function badge(statusKey, label) {
    const text = label || String(statusKey || "").replace(/_/g, " ");
    return `<span class="sync-badge sync-badge-${esc(statusKey)}">${esc(text)}</span>`;
  }

  /**
   * Merge two instruction-text lists into one ordered view: config lines
   * first (marked "both" or "config-only"), then any WMS-only lines
   * appended (matched by normalized-text membership, same semantics as
   * the real _compare_instruction_lists / stepHas*TextsMissingIn* helpers —
   * not a positional/LCS diff, just set membership).
   */
  function unifiedDiffLines(configTexts, wmsTexts) {
    const cfg = Array.isArray(configTexts) ? configTexts : [];
    const wms = Array.isArray(wmsTexts) ? wmsTexts : [];
    const wmsNorm = new Set(wms.map(normalizeText).filter(Boolean));
    const cfgNorm = new Set(cfg.map(normalizeText).filter(Boolean));
    const lines = cfg.map((text) => ({
      text,
      kind: wmsNorm.has(normalizeText(text)) ? "both" : "config-only"
    }));
    wms.forEach((text) => {
      if (!cfgNorm.has(normalizeText(text))) {
        lines.push({ text, kind: "wms-only" });
      }
    });
    return lines;
  }

  function diffLinesHtml(configTexts, wmsTexts) {
    const lines = unifiedDiffLines(configTexts, wmsTexts);
    if (!lines.length) {
      return `<div class="diff-empty">No instructions on either side.</div>`;
    }
    return `<ul class="diff-lines">${lines
      .map((l) => {
        const mark = l.kind === "config-only" ? "+" : l.kind === "wms-only" ? "−" : "";
        return `<li class="diff-line diff-line-${l.kind}">
          <span class="diff-gutter">${mark}</span>
          <span class="diff-text">${esc(l.text)}</span>
          ${
            l.kind === "config-only"
              ? '<span class="diff-tag">only in config</span>'
              : l.kind === "wms-only"
                ? '<span class="diff-tag">only in WMS</span>'
                : ""
          }
        </li>`;
      })
      .join("")}</ul>`;
  }

  /** Steps present in config but missing from WMS (a real presence gap). */
  function stepsMissingInWms(type) {
    return (type.steps || []).filter((s) => s && s.status === "missing_in_wms");
  }

  /** Steps present in WMS but missing from config (a real presence gap). */
  function stepsMissingInConfig(type) {
    return (type.steps || []).filter((s) => s && s.status === "missing_in_config");
  }

  /**
   * Text-level push gap: config has instruction text WMS doesn't.
   * Deliberately does NOT treat "instructions_differ" alone as a gap —
   * that status is direction-agnostic (see js/vas-config-sync.js fix);
   * only actual text-membership or a fully-missing-in-wms step counts.
   */
  function stepHasPushTextGap(step) {
    if (!step) return false;
    if (step.instructionStatus === "instructions_missing_in_wms") return true;
    const lines = unifiedDiffLines(step.configInstructions, step.wmsInstructions);
    return lines.some((l) => l.kind === "config-only");
  }

  function stepHasPullTextGap(step) {
    if (!step) return false;
    if (step.instructionStatus === "instructions_missing_in_config") return true;
    const lines = unifiedDiffLines(step.configInstructions, step.wmsInstructions);
    return lines.some((l) => l.kind === "wms-only");
  }

  function typeNeedsPushToWms(type) {
    if (!type) return false;
    if (type.status === "missing_in_wms") return true;
    return (type.steps || []).some(
      (s) => s && (s.status === "missing_in_wms" || stepHasPushTextGap(s))
    );
  }

  function typeNeedsPullToConfig(type) {
    if (!type) return false;
    if (type.status === "missing_in_config") return true;
    return (type.steps || []).some(
      (s) => s && (s.status === "missing_in_config" || stepHasPullTextGap(s))
    );
  }

  /**
   * Per-step equivalent of typeStatusHtml — same principle: no badge (i.e.
   * "fine") only when the step is genuinely gap-free, never a generic
   * "wording differs" label when it's actually missing from one side.
   */
  function stepGapBadge(step) {
    if (!step) return "";
    if (step.status === "missing_in_wms") return badge("missing_in_wms");
    if (step.status === "missing_in_config") return badge("missing_in_config");
    const badges = [];
    if (stepHasPushTextGap(step)) badges.push(badge("missing_in_wms"));
    if (stepHasPullTextGap(step)) badges.push(badge("missing_in_config"));
    return badges.join(" ");
  }

  function typeGapCounts(type) {
    return {
      stepsMissingInWms: stepsMissingInWms(type).length,
      stepsMissingInConfig: stepsMissingInConfig(type).length
    };
  }

  /** True instruction-wording mismatch — excludes pure reordering (see unifiedDiffLines). */
  function hasWordingDiff(type) {
    return (type && type.steps ? type.steps : []).some((s) => {
      const lines = unifiedDiffLines(s.configInstructions, s.wmsInstructions);
      return (
        lines.some((l) => l.kind !== "both") &&
        (s.configInstructions || []).length &&
        (s.wmsInstructions || []).length
      );
    });
  }

  /** No gaps in either direction and already deployed — the "nothing to do" state. */
  function isAligned(type) {
    return !!(
      type &&
      type.status === "aligned" &&
      !typeNeedsPushToWms(type) &&
      !typeNeedsPullToConfig(type) &&
      !type.notYetDeployed
    );
  }

  /**
   * One plain-language note ("2 steps → WMS · instruction → config") instead
   * of stacking badges. Deliberately never says "wording differs" — under
   * this diff model a mismatched line is never a fuzzy rewording, it's
   * always "this exact text exists on one side and not the other" (see
   * unifiedDiffLines), so the note says the specific, directional fact
   * instead — kept in sync with typeNeedsPushToWms/typeNeedsPullToConfig so
   * it never disagrees with what the attention-strip filters count.
   */
  function gapNote(type) {
    if (type.status === "missing_in_wms") return `<span class="sync-gap-count">whole type not in WMS yet</span>`;
    if (type.status === "missing_in_config") return `<span class="sync-gap-count">whole type not in config yet</span>`;
    const gaps = typeGapCounts(type);
    const parts = [];
    if (gaps.stepsMissingInWms) {
      parts.push(`${gaps.stepsMissingInWms} step${gaps.stepsMissingInWms > 1 ? "s" : ""} → WMS`);
    } else if (typeNeedsPushToWms(type)) {
      parts.push("instruction → WMS");
    }
    if (gaps.stepsMissingInConfig) {
      parts.push(`${gaps.stepsMissingInConfig} step${gaps.stepsMissingInConfig > 1 ? "s" : ""} → config`);
    } else if (typeNeedsPullToConfig(type)) {
      parts.push("instruction → config");
    }
    return parts.length ? `<span class="sync-gap-count">${esc(parts.join(" · "))}</span>` : "";
  }

  /**
   * "Aligned" means exactly one thing, everywhere: no gap in either
   * direction, and deployed. `type.status` only tells you the type/step
   * itself exists on both sides — that's necessary but not sufficient, so
   * display code should never render it directly. Use this (or
   * typeStatusHtml) instead, which folds in instruction-level gaps and
   * not-yet-deployed the same way isAligned() does, so a row can never say
   * "Aligned" while something is actually missing.
   */
  function typeStatusKey(type) {
    if (!type) return "aligned";
    if (type.notYetDeployed) return "not_deployed";
    if (typeNeedsPushToWms(type)) return "missing_in_wms";
    if (typeNeedsPullToConfig(type)) return "missing_in_config";
    return "aligned";
  }

  /** "missing in WMS", "missing in config, missing in WMS", or "aligned". */
  function describeGapState(type) {
    const parts = [];
    if (typeNeedsPushToWms(type)) parts.push("missing in WMS");
    if (typeNeedsPullToConfig(type)) parts.push("missing in config");
    return parts.length ? parts.join(", ") : "aligned";
  }

  /**
   * Full status markup. Not-deployed takes visual priority (with the
   * underlying gap state as a secondary note). Otherwise: Aligned only when
   * isAligned() is true; any gap shows the same Missing in WMS/config
   * badge(s) used for whole-type gaps — one badge per direction, since a
   * type can genuinely have gaps in both at once.
   */
  function typeStatusHtml(type) {
    if (type && type.notYetDeployed) {
      return `${badge("not_deployed", "not deployed")} <span class="sync-status-secondary">(WMS: ${esc(
        describeGapState(type)
      )})</span>`;
    }
    if (isAligned(type)) return badge("aligned");
    const badges = [];
    if (typeNeedsPushToWms(type)) badges.push(badge("missing_in_wms"));
    if (typeNeedsPullToConfig(type)) badges.push(badge("missing_in_config"));
    return badges.join(" ");
  }

  /** One step's title + merged diff — the expanded-view content shared by C and D. */
  function stepDiffBlockHtml(step) {
    return `<div class="mb-2">
      <div class="sync-step-row-title mb-1">${esc(step.id)}</div>
      ${diffLinesHtml(step.configInstructions, step.wmsInstructions)}
    </div>`;
  }

  /** All of a type's steps, stacked — the expanded-view body for C and D. */
  function stepDiffListHtml(type) {
    return (type.steps || []).map(stepDiffBlockHtml).join("");
  }

  /** Gap chips for a type (one per gap kind) — C's card-header chip row. */
  function gapChipsHtml(type) {
    const gaps = typeGapCounts(type);
    const chips = [];
    if (type.status === "missing_in_wms") chips.push(badge("missing_in_wms", "whole type → WMS"));
    if (type.status === "missing_in_config") chips.push(badge("missing_in_config", "whole type → config"));
    if (gaps.stepsMissingInWms) chips.push(badge("missing_in_wms", `${gaps.stepsMissingInWms} step → WMS`));
    if (gaps.stepsMissingInConfig) chips.push(badge("missing_in_config", `${gaps.stepsMissingInConfig} step → config`));
    if (hasWordingDiff(type)) chips.push(badge("instructions_differ", "wording differs"));
    if (type.notYetDeployed) chips.push(badge("not_deployed", "not deployed"));
    return chips.join("") || badge("aligned");
  }

  /** Grey (secondary, muted) when disabled — solid blue with white text/icon when enabled. */
  function actionButtonClass(enabled) {
    return `btn btn-sm ${enabled ? "btn-primary" : "btn-secondary"}`;
  }

  /** Push/Pull action buttons — mirrors the real Sync page's markup + icons. */
  function actionButtonsHtml(opts) {
    const o = opts || {};
    const pushId = o.pushId || "pushBtn";
    const pullId = o.pullId || "pullBtn";
    const pushEnabled = !!o.pushEnabled;
    const pullEnabled = !!o.pullEnabled;
    return `<button type="button" class="${actionButtonClass(pushEnabled)}" id="${esc(pushId)}"${
      pushEnabled ? "" : " disabled"
    }>
        <i class="fa-solid fa-cloud-arrow-up"></i> Push to WMS
      </button>
      <button type="button" class="${actionButtonClass(pullEnabled)}" id="${esc(pullId)}"${
      pullEnabled ? "" : " disabled"
    }>
        <i class="fa-solid fa-cloud-arrow-down"></i> Pull into draft
      </button>`;
  }

  /** Re-color/enable existing Push/Pull buttons in place (no re-render needed). */
  function updateActionButtons(pushEnabled, pullEnabled, ids) {
    const pushEl = document.getElementById((ids && ids.pushId) || "pushBtn");
    const pullEl = document.getElementById((ids && ids.pullId) || "pullBtn");
    if (pushEl) {
      pushEl.className = actionButtonClass(pushEnabled);
      pushEl.disabled = !pushEnabled;
    }
    if (pullEl) {
      pullEl.className = actionButtonClass(pullEnabled);
      pullEl.disabled = !pullEnabled;
    }
  }

  /** Refresh / Save & Deploy — visual placeholders matching production exactly.
   * Not wired to anything (no data to refresh/save in a static mock), but left
   * visually enabled so they read the way they actually look in production. */
  function refreshButtonHtml() {
    return `<button type="button" class="btn btn-outline-secondary btn-sm">
      <i class="fa-solid fa-rotate"></i> Refresh
    </button>`;
  }
  function saveButtonHtml() {
    return `<button type="button" class="btn btn-success btn-sm">
      <i class="fa-solid fa-cloud-arrow-up"></i> Save &amp; Deploy
    </button>`;
  }

  function chrome(activeLayout) {
    const layouts = [
      ["layout-a-list-detail.html", "A · List + detail"],
      ["layout-d-hybrid.html", "D · Attention + compact rows"]
    ];
    const nav = layouts
      .map(
        ([href, label]) =>
          `<a href="${href}" class="${activeLayout === href ? "active" : ""}">${esc(label)}</a>`
      )
      .join("");
    return `<div class="mock-banner">
        Static mock · Sync page layout samples · <a href="index.html">All layouts</a>
      </div>
      <nav class="mock-nav">${nav}</nav>`;
  }

  window.SyncUI = {
    esc,
    normalizeText,
    badge,
    unifiedDiffLines,
    diffLinesHtml,
    stepsMissingInWms,
    stepsMissingInConfig,
    typeNeedsPushToWms,
    typeNeedsPullToConfig,
    typeGapCounts,
    typeStatusKey,
    typeStatusHtml,
    stepGapBadge,
    hasWordingDiff,
    isAligned,
    gapNote,
    stepDiffBlockHtml,
    stepDiffListHtml,
    gapChipsHtml,
    actionButtonClass,
    actionButtonsHtml,
    updateActionButtons,
    refreshButtonHtml,
    saveButtonHtml,
    chrome
  };
})();
