/** Shared inspection themes — used by admin.html (index.html keeps inline copy for now). */
(function (global) {
  const themes = {
      'default': {
        name: 'Default (Dark)',
        colors: {
          '--bg-dark': '#121212',
          '--card-bg': '#1e1e1e',
          '--input-bg': '#2d2d2d',
          '--border': '#333',
          '--text': '#e0e0e0',
          '--text-secondary': '#bbbbbb',
          '--text-muted': '#999',
          '--red-bg': '#4a1a1a',
          '--red-text': '#ff6b6b',
          '--blue-select': '#339af0',
          '--success': '#28a745',
          '--primary': '#0d6efd',
          '--primary-hover': '#0b5ed7',
          '--success-hover': '#218838',
          '--table-header-bg': '#2a2a2a',
          '--table-header-text': '#e0e0e0',
          '--input-border': '#444',
          '--input-focus-bg': '#333',
          '--input-focus-border': '#0d6efd',
          '--input-focus-shadow': 'rgba(13, 110, 253, 0.25)',
          '--logo-url': 'none',
          '--logo-display': 'none'
        },
        logo: null
      },
      'loves': {
        name: "Love's Travel Stops",
        colors: {
          '--bg-dark': '#f8f9fa',
          '--card-bg': '#ffffff',
          '--input-bg': '#f5f5f5',
          '--border': '#dee2e6',
          '--text': '#212529',
          '--text-secondary': '#495057',
          '--text-muted': '#6c757d',
          '--red-bg': '#fff5f5',
          '--red-text': '#dc3545',
          '--blue-select': '#0056b3',
          '--success': '#28a745',
          '--primary': '#E31837',
          '--primary-hover': '#C0142D',
          '--success-hover': '#218838',
          '--table-header-bg': '#E31837',
          '--table-header-text': '#ffffff',
          '--input-border': '#ced4da',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#E31837',
          '--input-focus-shadow': 'rgba(227, 24, 55, 0.25)',
          '--logo-url': 'url("/loves-logo.png")',
          '--logo-display': 'block'
        },
        logo: '/loves-logo.png'
      },
      'manhattan': {
        name: 'Manhattan Associates',
        colors: {
          '--bg-dark': '#f5f7fa',
          '--card-bg': '#ffffff',
          '--input-bg': '#f0f2f5',
          '--border': '#e1e8ed',
          '--text': '#1a1a1a',
          '--text-secondary': '#4a5568',
          '--text-muted': '#718096',
          '--red-bg': '#fff5f5',
          '--red-text': '#e53e3e',
          '--blue-select': '#3182ce',
          '--success': '#38a169',
          '--primary': '#0066cc',
          '--primary-hover': '#0052a3',
          '--success-hover': '#2f855a',
          '--table-header-bg': '#0066cc',
          '--table-header-text': '#ffffff',
          '--input-border': '#cbd5e0',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#0066cc',
          '--input-focus-shadow': 'rgba(0, 102, 204, 0.25)',
          '--logo-url': 'url("/manhattan-logo.png")',
          '--logo-display': 'block'
        },
        logo: '/manhattan-logo.png'
      },
      'msc': {
        name: 'MSC Industrial Supply',
        colors: {
          '--bg-dark': '#fafafa',
          '--card-bg': '#ffffff',
          '--input-bg': '#f0f0f0',
          '--border': '#e0e0e0',
          '--text': '#1a1a1a',
          '--text-secondary': '#4a4a4a',
          '--text-muted': '#757575',
          '--red-bg': '#ffebee',
          '--red-text': '#c62828',
          '--blue-select': '#1976d2',
          '--success': '#388e3c',
          '--primary': '#003d82',
          '--primary-hover': '#002d5f',
          '--success-hover': '#2e7d32',
          '--table-header-bg': '#003d82',
          '--table-header-text': '#ffffff',
          '--input-border': '#bdbdbd',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#003d82',
          '--input-focus-shadow': 'rgba(0, 61, 130, 0.25)',
          '--logo-url': 'url("/msc-logo.png")',
          '--logo-display': 'block'
        },
        logo: '/msc-logo.png'
      },
      'light': {
        name: 'Light Theme',
        colors: {
          '--bg-dark': '#f8f9fa',
          '--card-bg': '#ffffff',
          '--input-bg': '#f5f5f5',
          '--border': '#dee2e6',
          '--text': '#212529',
          '--text-secondary': '#495057',
          '--text-muted': '#6c757d',
          '--red-bg': '#fff5f5',
          '--red-text': '#dc3545',
          '--blue-select': '#0056b3',
          '--success': '#28a745',
          '--primary': '#0d6efd',
          '--primary-hover': '#0b5ed7',
          '--success-hover': '#218838',
          '--table-header-bg': '#6c757d',
          '--table-header-text': '#ffffff',
          '--input-border': '#ced4da',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#0d6efd',
          '--input-focus-shadow': 'rgba(13, 110, 253, 0.25)',
          '--logo-url': 'none',
          '--logo-display': 'none'
        },
        logo: null
      },
      'rockline': {
        name: 'Rockline Industries',
        colors: {
          '--bg-dark': '#f4f6f3',
          '--card-bg': '#ffffff',
          '--input-bg': '#f0f2ee',
          '--border': '#d4ddd0',
          '--text': '#2d2d2d',
          '--text-secondary': '#4a5548',
          '--text-muted': '#6b7d66',
          '--red-bg': '#fff5f5',
          '--red-text': '#c62828',
          '--blue-select': '#4a8c3f',
          '--success': '#6EB43F',
          '--primary': '#6EB43F',
          '--primary-hover': '#5a9a32',
          '--success-hover': '#5a9a32',
          '--table-header-bg': '#2d2d2d',
          '--table-header-text': '#ffffff',
          '--input-border': '#b8c9b3',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#6EB43F',
          '--input-focus-shadow': 'rgba(110, 180, 63, 0.25)',
          '--logo-url': 'url("/rockline_logo.png")',
          '--logo-display': 'block'
        },
        logo: '/rockline_logo.png'
      },
      'steris': {
        name: 'Steris',
        colors: {
          '--bg-dark': '#f5f7fa',
          '--card-bg': '#ffffff',
          '--input-bg': '#f0f2f5',
          '--border': '#d8dee6',
          '--text': '#1a1a1a',
          '--text-secondary': '#333333',
          '--text-muted': '#6b7280',
          '--red-bg': '#fff5f5',
          '--red-text': '#c62828',
          '--blue-select': '#0072BC',
          '--success': '#0072BC',
          '--primary': '#0072BC',
          '--primary-hover': '#005a94',
          '--success-hover': '#005a94',
          '--table-header-bg': '#0072BC',
          '--table-header-text': '#ffffff',
          '--input-border': '#c5cdd6',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#0072BC',
          '--input-focus-shadow': 'rgba(0, 114, 188, 0.25)',
          '--logo-url': 'url("/sterislogo.png")',
          '--logo-display': 'block'
        },
        logo: '/sterislogo.png',
        logoMaxHeight: '60px',
        logoMaxWidth: '220px'
      },
      'corporate-blue': {
        name: 'Corporate Blue',
        colors: {
          '--bg-dark': '#e3f2fd',
          '--card-bg': '#ffffff',
          '--input-bg': '#f5f5f5',
          '--border': '#90caf9',
          '--text': '#1565c0',
          '--text-secondary': '#1976d2',
          '--text-muted': '#64b5f6',
          '--red-bg': '#ffebee',
          '--red-text': '#c62828',
          '--blue-select': '#0d47a1',
          '--success': '#2e7d32',
          '--primary': '#1565c0',
          '--primary-hover': '#0d47a1',
          '--success-hover': '#1b5e20',
          '--table-header-bg': '#1565c0',
          '--table-header-text': '#ffffff',
          '--input-border': '#90caf9',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#1565c0',
          '--input-focus-shadow': 'rgba(21, 101, 192, 0.25)',
          '--logo-url': 'none',
          '--logo-display': 'none'
        },
        logo: null
      },
      'nissan': {
        name: 'Nissan',
        colors: {
          '--bg-dark': '#f0f0f0',
          '--card-bg': '#ffffff',
          '--input-bg': '#f5f5f5',
          '--border': '#d9d9d9',
          '--text': '#1a1a1a',
          '--text-secondary': '#3d3d3d',
          '--text-muted': '#6e6e6e',
          '--red-bg': '#fff0f0',
          '--red-text': '#C3002F',
          '--blue-select': '#C3002F',
          '--success': '#C3002F',
          '--primary': '#C3002F',
          '--primary-hover': '#a00027',
          '--success-hover': '#a00027',
          '--table-header-bg': '#1a1a1a',
          '--table-header-text': '#ffffff',
          '--input-border': '#c0c0c0',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#C3002F',
          '--input-focus-shadow': 'rgba(195, 0, 47, 0.25)',
          '--logo-url': 'url("/nissan_logo.png")',
          '--logo-display': 'block'
        },
        logo: '/nissan_logo.png',
        logoMaxHeight: '100px'
      },
      'kendrascott': {
        name: 'Kendra Scott',
        colors: {
          '--bg-dark': '#f5f1eb',
          '--card-bg': '#ffffff',
          '--input-bg': '#faf8f5',
          '--border': '#e6e0d8',
          '--text': '#2b2622',
          '--text-secondary': '#5c554c',
          '--text-muted': '#8c8478',
          '--red-bg': '#fdf2f2',
          '--red-text': '#b42318',
          '--blue-select': '#8b6f47',
          '--success': '#4a6b52',
          '--primary': '#8b6f47',
          '--primary-hover': '#6f5838',
          '--success-hover': '#3d5544',
          '--table-header-bg': '#3d3329',
          '--table-header-text': '#faf8f5',
          '--input-border': '#d4ccc2',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#8b6f47',
          '--input-focus-shadow': 'rgba(139, 111, 71, 0.22)',
          '--logo-url': 'url("/kendrascott_logo.png")',
          '--logo-display': 'block'
        },
        logo: '/kendrascott_logo.png',
        logoMaxHeight: '126px',
        logoMaxWidth: '300px',
        logoMobileScale: 0.8
      },
      'pricesmart': {
        name: 'PriceSmart',
        colors: {
          '--bg-dark': '#eef3f8',
          '--card-bg': '#ffffff',
          '--input-bg': '#f5f8fc',
          '--border': '#c5d4e8',
          '--text': '#1a2d42',
          '--text-secondary': '#2f4a66',
          '--text-muted': '#5c7389',
          '--red-bg': '#fff0f0',
          '--red-text': '#c62828',
          '--blue-select': '#003087',
          '--success': '#E34226',
          '--primary': '#003087',
          '--primary-hover': '#00245f',
          '--success-hover': '#C7351F',
          '--table-header-bg': '#003087',
          '--table-header-text': '#ffffff',
          '--input-border': '#b8c9de',
          '--input-focus-bg': '#ffffff',
          '--input-focus-border': '#003087',
          '--input-focus-shadow': 'rgba(0, 48, 135, 0.25)',
          '--logo-url': 'url("/pricesmart_logo.png")',
          '--logo-display': 'block'
        },
        logo: '/pricesmart_logo.png',
        logoMaxHeight: '56px',
        logoMaxWidth: '240px'
      }
    };

  let activeThemeKey = 'default';

  function isMobileLayout() {
    return window.matchMedia('(max-width: 991px)').matches;
  }

  function syncThemeLogoSize(themeLogo) {
    const theme = themes[activeThemeKey];
    if (!theme?.logo || !themeLogo) return;
    const height = theme.logoMaxHeight || '50px';
    const width = theme.logoMaxWidth;
    const scale = theme.logoMobileScale;
    if (scale && isMobileLayout()) {
      themeLogo.style.maxHeight = `calc(${height} * ${scale})`;
      if (width) themeLogo.style.maxWidth = `calc(${width} * ${scale})`;
    } else {
      themeLogo.style.maxHeight = height;
      if (width) themeLogo.style.maxWidth = width;
      else themeLogo.style.removeProperty('max-width');
    }
  }

  function parseHexColor(value) {
    const raw = String(value || "").trim();
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return null;
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  /** WCAG relative luminance (0–1) for #rgb / #rrggbb. */
  function relativeLuminance(color) {
    const rgb = parseHexColor(color);
    if (!rgb) return 0.15; // assume dark if unknown
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return (
      0.2126 * channel(rgb.r) +
      0.7152 * channel(rgb.g) +
      0.0722 * channel(rgb.b)
    );
  }

  /** Chip label that contrasts with card/page background. */
  function statusChipForeground(colors) {
    const bg =
      (colors && (colors["--card-bg"] || colors["--bg-dark"])) || "#1e1e1e";
    // Light surfaces → near-black label; dark surfaces → near-white label
    return relativeLuminance(bg) > 0.45 ? "#111111" : "#f5f5f5";
  }

  function applyContrastVars(target, colors) {
    if (!target || !target.style) return;
    target.style.setProperty("--status-chip-fg", statusChipForeground(colors));
  }

  function applyThemeToScope(themeKey, scopeEl, logoEl) {
    const theme = themes[themeKey];
    if (!theme || !scopeEl) return themeKey;
    Object.entries(theme.colors).forEach(([property, value]) => {
      scopeEl.style.setProperty(property, value);
    });
    applyContrastVars(scopeEl, theme.colors);
    scopeEl.style.background = theme.colors['--bg-dark'] || '#121212';
    scopeEl.style.color = theme.colors['--text'] || '#e0e0e0';
    if (logoEl) {
      if (theme.logo) {
        logoEl.src = theme.logo;
        logoEl.style.display = 'block';
        logoEl.style.maxHeight = theme.logoMaxHeight || '40px';
        if (theme.logoMaxWidth) logoEl.style.maxWidth = theme.logoMaxWidth;
        else logoEl.style.removeProperty('max-width');
      } else {
        logoEl.style.display = 'none';
        logoEl.removeAttribute('src');
      }
    }
    return themeKey;
  }

  /** Same surface as the preview device header (where logos render). */
  function themePickerThumbBackground(theme) {
    const colors = theme.colors || {};
    return colors['--card-bg'] || colors['--bg-dark'] || '#f8f9fa';
  }

  function renderPreviewThemeList(themeList, themeModal, { scopeEl, logoEl, storageKey = 'adminPreviewTheme', currentKey }) {
    if (!themeList) return;
    themeList.innerHTML = '';
    const active = currentKey || localStorage.getItem(storageKey) || 'default';
    Object.entries(themes)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .forEach(([key, theme]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'list-group-item list-group-item-action theme-picker-item' + (key === active ? ' active' : '');
        const thumbBg = themePickerThumbBackground(theme);
        const thumb = theme.logo
          ? `<span class="theme-picker-thumb-wrap" style="background:${thumbBg}"><img class="theme-picker-thumb" src="${theme.logo}" alt="" /></span>`
          : `<span class="theme-picker-thumb-wrap" style="background:${thumbBg}"><span class="theme-picker-thumb-empty"></span></span>`;
        item.innerHTML = `<span class="theme-picker-row">${thumb}<span>${theme.name}</span></span>`;
        item.onclick = () => {
          applyThemeToScope(key, scopeEl, logoEl);
          localStorage.setItem(storageKey, key);
          if (themeModal) themeModal.hide();
        };
        themeList.appendChild(item);
      });
  }

  function loadPreviewTheme(scopeEl, logoEl, storageKey = 'adminPreviewTheme') {
    const saved = localStorage.getItem(storageKey) || 'default';
    return applyThemeToScope(saved, scopeEl, logoEl);
  }

  function applyTheme(themeKey, themeLogo) {
    const theme = themes[themeKey];
    if (!theme) return;
    activeThemeKey = themeKey;
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
    applyContrastVars(root, theme.colors);
    if (themeLogo) {
      if (theme.logo) {
        themeLogo.src = theme.logo;
        themeLogo.style.display = 'block';
        syncThemeLogoSize(themeLogo);
      } else {
        themeLogo.style.display = 'none';
        themeLogo.style.maxHeight = '50px';
        themeLogo.style.removeProperty('max-width');
      }
    }
    localStorage.setItem('selectedTheme', themeKey);
  }

  function loadTheme(themeLogo) {
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    applyTheme(savedTheme, themeLogo);
  }

  function renderThemeList(themeList, themeModal, themeLogo) {
    if (!themeList) return;
    themeList.innerHTML = '';
    const currentTheme = localStorage.getItem('selectedTheme') || 'default';
    Object.entries(themes)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .forEach(([key, theme]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'list-group-item list-group-item-action' + (key === currentTheme ? ' active' : '');
        item.textContent = theme.name;
        item.onclick = () => {
          applyTheme(key, themeLogo);
          if (themeModal) themeModal.hide();
        };
        themeList.appendChild(item);
      });
  }

  function wireThemePicker({ themeSelectorBtn, themeModal, themeList, themeLogo }) {
    loadTheme(themeLogo);
    if (themeSelectorBtn && themeModal) {
      themeSelectorBtn.onclick = () => {
        renderThemeList(themeList, themeModal, themeLogo);
        themeModal.show();
      };
    }
    window.addEventListener('resize', () => syncThemeLogoSize(themeLogo));
  }

  global.InspectionThemes = {
    themes,
    applyTheme,
    applyThemeToScope,
    loadTheme,
    loadPreviewTheme,
    renderThemeList,
    renderPreviewThemeList,
    wireThemePicker,
    getActiveThemeKey: () => activeThemeKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
