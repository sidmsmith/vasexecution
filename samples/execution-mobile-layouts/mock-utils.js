(function () {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function typeCfg(svc) {
    return (
      window.MOCK.typeConfig[svc.ProvidedServiceId] || {
        // Relative, not "/assets/..." — same file:// fix as the theme logo (see initMockTheme).
        icon: "../../assets/icons/vas-type-default.svg",
        sections: {},
        steps: {}
      }
    );
  }

  /**
   * Real production rendering, not a mockup approximation: hands the real config
   * step entry to VasConfig.normalizeStepEntry + VasConfig.renderStepContentHtml
   * (js/vas-config.js, loaded by every mockup here) so bold/italic/underline/
   * color/fontSize/listMarker/images/multi-column layout all come out exactly as
   * they would in the real app.
   */
  function stepContentHtml(svc, stepId) {
    const raw = typeCfg(svc).steps[stepId];
    if (!raw) return `<div class="vas-content-list"><p class="text-muted small mb-0">No content configured.</p></div>`;
    const stepCfg = window.VasConfig.normalizeStepEntry(raw, stepId);
    if (!window.VasConfig.stepHasContent(stepCfg)) {
      return `<div class="vas-content-list"><p class="text-muted small mb-0">No content configured.</p></div>`;
    }
    return window.VasConfig.renderStepContentHtml(stepCfg, esc);
  }

  function stepQtySummary(step) {
    return `${step.comp} of ${step.req} complete`;
  }

  function statusBadgeClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "complete" || s === "completed") return "status-complete";
    if (s === "created") return "status-created";
    return "status-other";
  }

  function stepStatusLabel(step) {
    if (step.comp >= step.req) return "Complete";
    if (step.comp > 0) return "In Progress";
    return "Created";
  }

  function serviceProgress(svc) {
    const total = svc.steps.length;
    const done = svc.steps.filter((s) => s.comp >= s.req).length;
    return { total, done };
  }

  function serviceStatusLabel(svc) {
    const { total, done } = serviceProgress(svc);
    if (done >= total) return "Complete";
    if (done > 0) return "In Progress";
    return svc.Status || "Created";
  }

  /** Two themes only, per request: current dark default + SHI (light).
   *  _v2 because earlier testing wrote "default" under the old key before the
   *  SHI-first-load fallback existed — that stale value would otherwise stick
   *  forever (the fallback below only applies when nothing is stored yet). */
  const MOCK_THEME_KEY = "mockExecutionMobileTheme_v2";
  const MOCK_THEMES = [
    ["default", "Dark"],
    ["shi", "SHI (Light)"]
  ];

  function themeToggleHtml() {
    const btns = MOCK_THEMES.map(
      ([key, label]) => `<button type="button" class="mock-theme-btn" data-mock-theme-btn="${key}">${esc(label)}</button>`
    ).join("");
    return `<div class="mock-theme-toggle"><span class="mock-theme-toggle-label">Theme</span>${btns}</div>`;
  }

  /** Applies to the page root via InspectionThemes, under our own storage key so it
   *  never touches the real app's 'selectedTheme' preference. Call after the toggle
   *  markup (from chrome()/themeToggleHtml()) is in the DOM. Pass logoEl (the
   *  persistent brand-header <img class="theme-logo">) so the logo swaps with
   *  the theme too, same as InspectionThemes already does in the real app.
   *
   *  Logo handled separately from applyThemeToScope: InspectionThemes sets an
   *  absolute-rooted src ("/shi_logo.png"), which only resolves correctly when
   *  this page is served over http(s) from the repo root. Opened directly as a
   *  file (file://layout-c-refined.html), an absolute "/" path resolves against
   *  the filesystem root instead and the image just silently fails to load —
   *  no error, no broken-image icon most browsers even show for that case, so
   *  it looks like the logo simply isn't there. A path relative to this file
   *  (two levels up to the repo root) resolves correctly either way. */
  function initMockTheme(logoEl) {
    function apply(key) {
      window.InspectionThemes.applyThemeToScope(key, document.documentElement, null);
      localStorage.setItem(MOCK_THEME_KEY, key);
      document.querySelectorAll("[data-mock-theme-btn]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mockThemeBtn === key);
      });
      if (logoEl) {
        const theme = (window.InspectionThemes.themes || {})[key];
        if (theme && theme.logo) {
          logoEl.src = "../../" + String(theme.logo).replace(/^\//, "");
          logoEl.style.display = "block";
          logoEl.style.maxHeight = theme.logoMaxHeight || "40px";
          if (theme.logoMaxWidth) logoEl.style.maxWidth = theme.logoMaxWidth;
          else logoEl.style.removeProperty("max-width");
        } else {
          logoEl.style.display = "none";
          logoEl.removeAttribute("src");
        }
      }
    }
    document.querySelectorAll("[data-mock-theme-btn]").forEach((btn) => {
      btn.onclick = () => apply(btn.dataset.mockThemeBtn);
    });
    // Default to SHI so the logo/branding is visible on first load without
    // requiring a click — that's the whole point of this theme pass.
    apply(localStorage.getItem(MOCK_THEME_KEY) || "shi");
  }

  function chrome(pageName) {
    const m = window.MOCK;
    const pages = [
      ["layout-own.html", "A — Card-first (no reference)"],
      ["layout-supplier-aligned.html", "B — Supplier Enablement–aligned"],
      ["layout-c-refined.html", "C — Refined (A+B combined)"]
    ];
    const nav = pages
      .map(
        ([href, label]) =>
          `<a href="${href}" class="${pageName === href ? "active" : ""}">${esc(label)}</a>`
      )
      .join("");
    return `<div class="mock-banner">
        Static mock · Mobile execution layout samples · <a href="index.html">All layouts</a>
      </div>
      <nav class="mock-nav">${nav}</nav>
      ${themeToggleHtml()}
      <div class="olpn-meta">oLPN ${esc(m.olpnId)} · Order ${esc(m.orderId)}</div>`;
  }

  window.MockUI = {
    esc,
    typeCfg,
    stepContentHtml,
    stepQtySummary,
    statusBadgeClass,
    stepStatusLabel,
    serviceProgress,
    serviceStatusLabel,
    themeToggleHtml,
    initMockTheme,
    chrome
  };
})();
