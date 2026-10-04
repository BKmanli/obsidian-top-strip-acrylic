const { Plugin, Notice, Platform } = require('obsidian');

const MARKER = 'top-strip-acrylic-enabled';
const CONTROL = 'top-strip-acrylic-control';
const SURFACES = 'body,.app-container,.workspace,.workspace-split,.workspace-tabs,.workspace-tab-header-container,.titlebar,.titlebar-inner,.titlebar-button-container,.sidebar-toggle-button';

module.exports = class TopStripAcrylic extends Plugin {
  onload() {
    if (!Platform.isWin) return;
    this.doc = this.app.workspace.containerEl.ownerDocument;
    this.win = this.doc.defaultView;
    this.native = this.win.electronWindow;
    this.original = new Map();
    this.controls = new Set();
    this.stopped = false;
    try {
      const [major, , build] = require('os').release().split('.').map(Number);
      if (major < 10 || !Number.isFinite(build) || build < 22621) {
        throw new Error('Native Acrylic requires Windows 11 22H2 or newer.');
      }
      this.nativeTheme = this.win.electron?.remote?.nativeTheme || require('@electron/remote').nativeTheme;
      if (typeof this.native?.setBackgroundMaterial !== 'function' || !this.nativeTheme) {
        throw new Error('This Obsidian runtime does not support native Acrylic.');
      }
      this.originalThemeSource = this.nativeTheme.themeSource;
      this.style = this.doc.createElement('style');
      this.observedDark = this.isDark();
      this.themeObserver = new this.win.MutationObserver(() => {
        const dark = this.isDark();
        if (dark !== this.observedDark) {
          this.observedDark = dark;
          this.schedule(true);
        }
      });
      this.themeObserver.observe(this.doc.body, { attributes: true, attributeFilter: ['class'] });
      this.register(() => this.themeObserver.disconnect());
      // A native update must not write themeSource again: multiple vaults share it.
      this.nativeThemeUpdated = () => this.schedule(false);
      this.nativeTheme.on('updated', this.nativeThemeUpdated);
      this.register(() => this.nativeTheme.removeListener('updated', this.nativeThemeUpdated));
      this.registerEvent(this.app.workspace.on('css-change', () => this.schedule(true)));
      this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule(false)));
      this.registerDomEvent(this.win, 'resize', () => this.schedule(false));
      this.registerDomEvent(this.win, 'focus', () => this.schedule(true));
      this.app.workspace.onLayoutReady(() => this.schedule(true));
    } catch (error) {
      this.fail(error);
    }
  }

  isDark() { return this.doc.body.classList.contains('theme-dark'); }

  schedule(syncTheme) {
    if (this.stopped || this.failed) return;
    this.pendingThemeSync = this.pendingThemeSync || syncTheme;
    if (this.frame != null) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      const sync = this.pendingThemeSync;
      this.pendingThemeSync = false;
      this.apply(sync);
    });
  }

  remember(element, properties) {
    const saved = this.original.get(element) || new Map();
    for (const property of properties) {
      if (!saved.has(property)) saved.set(property, [element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    }
    this.original.set(element, saved);
  }

  restoreInline() {
    for (const [element, properties] of this.original || []) {
      for (const [property, [value, priority]] of properties) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
    this.original?.clear();
    for (const element of this.controls || []) element.classList.remove(CONTROL);
    this.controls?.clear();
  }

  controlCss(dark) {
    const ink = dark ? '#f5f6f8' : '#20242b';
    const halo = dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.65)';
    return `body.${MARKER} .workspace-ribbon.mod-left::before,
      body.${MARKER} .titlebar-button-container { background-color: transparent !important; }
      body.${MARKER} .${CONTROL} {
        color: ${ink} !important; opacity: 1 !important;
        --icon-color: ${ink}; --icon-color-hover: ${ink}; --icon-color-focused: ${ink};
        --icon-opacity: 1; --icon-opacity-hover: 1; --icon-opacity-active: 1;
      }
      body.${MARKER} .${CONTROL} svg { filter: drop-shadow(0 0 1px ${halo}); }
      body.${MARKER} .titlebar-button.${CONTROL} .svg-icon { fill: ${ink} !important; stroke: ${ink} !important; }
      body.${MARKER} .titlebar-button.mod-close.${CONTROL}:hover .svg-icon { fill: white !important; stroke: white !important; filter: none; }`;
  }

  apply(syncTheme) {
    if (this.stopped || this.failed) return;
    try {
      this.restoreInline();
      this.doc.body.classList.remove(MARKER);
      this.style.remove();
      const headers = [...this.doc.querySelectorAll('.workspace-tab-header-container')]
        .map(element => element.getBoundingClientRect()).filter(rect => rect.height > 0 && rect.top >= -1 && rect.top < 2);
      if (!headers.length) throw new Error('No top tab strip found. Use the custom Obsidian title bar.');
      const bottom = Math.max(...headers.map(rect => rect.bottom));
      if (bottom < 20 || bottom > 70) throw new Error('The top strip layout is unsupported.');

      // Read and validate all backgrounds before changing any of them.
      const surfaces = [];
      for (const element of this.doc.querySelectorAll(SURFACES)) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.top >= bottom || rect.bottom <= 0) continue;
        const computed = this.win.getComputedStyle(element);
        if (computed.backgroundImage !== 'none') throw new Error('An existing top background image is incompatible with Acrylic.');
        const background = computed.backgroundColor;
        if (background === 'transparent' || background === 'rgba(0, 0, 0, 0)') continue;
        surfaces.push({ element, background, cut: Math.max(0, bottom - rect.top) });
      }
      if (!this.nativeApplied) {
        this.native.setBackgroundMaterial('acrylic');
        this.nativeApplied = true;
      }
      if (syncTheme) {
        const desired = this.isDark() ? 'dark' : 'light';
        if (this.nativeTheme.themeSource !== desired) {
          this.lastThemeSource = desired;
          this.nativeTheme.themeSource = desired;
        }
      }
      for (const { element, background, cut } of surfaces) {
        this.remember(element, ['background-color', 'background-image']);
        element.style.setProperty('background-color', 'transparent', 'important');
        element.style.setProperty('background-image', `linear-gradient(to bottom, transparent 0px, transparent ${cut}px, ${background} ${cut}px, ${background} 100%)`, 'important');
      }
      for (const element of this.doc.querySelectorAll('.clickable-icon,.titlebar-button,.workspace-tab-header-inner-icon')) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.top >= bottom || rect.bottom <= 0) continue;
        if (element.closest('.workspace-tab-header.is-active')?.closest('.mod-root')) continue;
        if (!element.classList.contains(CONTROL)) {
          element.classList.add(CONTROL);
          this.controls.add(element);
        }
      }
      for (const element of this.doc.querySelectorAll('.workspace-leaf-resize-handle')) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.top >= bottom || rect.bottom <= bottom) continue;
        this.remember(element, ['clip-path']);
        element.style.setProperty('clip-path', `inset(${Math.max(0, bottom - rect.top)}px 0 0 0)`, 'important');
      }
      const dark = !!this.nativeTheme.shouldUseDarkColors;
      this.style.textContent = this.controlCss(dark);
      this.doc.head.appendChild(this.style);
      this.doc.body.classList.add(MARKER);
      this.status = { applied: true, stripBottom: bottom, nativeDark: dark, themeSource: this.nativeTheme.themeSource };
    } catch (error) { this.fail(error); }
  }

  restoreNative() {
    if (this.nativeApplied) {
      this.native.setBackgroundMaterial('none');
      this.nativeApplied = false;
    }
    // Do not overwrite a source changed by another plugin since our last write.
    if (this.lastThemeSource && this.nativeTheme.themeSource === this.lastThemeSource) {
      this.nativeTheme.themeSource = this.originalThemeSource;
    }
    this.lastThemeSource = null;
  }

  fail(error) {
    this.failed = true;
    this.restoreInline();
    this.doc?.body.classList.remove(MARKER);
    this.style?.remove();
    try { this.restoreNative(); } catch (restoreError) { console.error('Top Strip Acrylic: restore failed', restoreError); }
    this.status = { applied: false, error: error.message };
    new Notice(`Top Strip Acrylic: ${error.message}`);
  }

  onunload() {
    this.stopped = true;
    if (this.frame != null) this.win.cancelAnimationFrame(this.frame);
    this.restoreInline();
    this.doc?.body.classList.remove(MARKER);
    this.style?.remove();
    try { this.restoreNative(); } catch (error) { console.error('Top Strip Acrylic: restore failed', error); }
  }
};
