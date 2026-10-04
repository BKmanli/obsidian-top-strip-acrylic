const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(require.resolve('../main.js'), 'utf8');

function fixture({ windows = true, backgroundImage = false, top = 40, sourceTheme = 'system', osRelease = '10.0.26100', themeMode = 'obsidian', osDark = false } = {}) {
  const dom = new JSDOM(`<html><head><style>* { background-image: none; } body,.workspace,.workspace-tab-header-container { background-color: rgb(30,30,30); } .view-content { background-color: rgb(44,44,44); }</style></head><body class="theme-dark"><div class="workspace"><div class="workspace-tab-header-container"><button class="clickable-icon" id="top"></button><div class="mod-root"><div class="workspace-tab-header is-active"><span class="workspace-tab-header-inner-icon" id="active"></span></div></div></div><div class="workspace-leaf-resize-handle"></div><div class="view-content"><button class="clickable-icon" id="lower"></button></div></div></body></html>`);
  const { window } = dom;
  const frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  for (const element of window.document.querySelectorAll('*')) {
    const lower = element.matches('.view-content,#lower');
    const strip = element.matches('.workspace-tab-header-container,#top,#active');
    element.getBoundingClientRect = () => ({ x: 0, y: lower ? top : 0, top: lower ? top : 0, bottom: strip ? top : 600, width: 600, height: strip ? top : lower ? 600 - top : 600 });
  }
  if (backgroundImage) window.document.querySelector('.workspace').style.backgroundImage = 'linear-gradient(red, blue)';
  const nativeTheme = new EventEmitter();
  let themeSource = sourceTheme;
  const writes = [];
  Object.defineProperties(nativeTheme, {
    themeSource: { get: () => themeSource, set: value => { writes.push(value); themeSource = value; nativeTheme.emit('updated'); } },
    shouldUseDarkColors: { get: () => themeSource === 'system' ? osDark : themeSource === 'dark' }
  });
  const materials = [];
  window.electronWindow = { setBackgroundMaterial: value => materials.push(value) };
  window.electron = { remote: { nativeTheme } };
  const workspaceEvents = new EventEmitter();
  const vaultEvents = new EventEmitter();
  const updateAppTheme = () => {
    const dark = themeMode === 'system' ? nativeTheme.shouldUseDarkColors : themeMode === 'obsidian';
    const before = window.document.body.classList.contains('theme-dark');
    window.document.body.classList.toggle('theme-dark', dark);
    window.document.body.classList.toggle('theme-light', !dark);
    if (before !== dark) workspaceEvents.emit('css-change');
  };
  nativeTheme.on('updated', () => { if (themeMode === 'system') updateAppTheme(); });
  updateAppTheme();
  const notices = [];
  class Plugin {
    constructor() { this.disposers = []; }
    register(dispose) { this.disposers.push(dispose); }
    registerEvent(event) { this.register(event); }
    registerDomEvent(target, event, callback) { target.addEventListener(event, callback); this.register(() => target.removeEventListener(event, callback)); }
  }
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: name => {
    if (name === 'os') return { release: () => osRelease };
    assert.equal(name, 'obsidian');
    return { Plugin, Notice: class { constructor(text) { notices.push(text); } }, Platform: { isWin: windows } };
  }, console });
  const plugin = new module.exports();
  plugin.app = { vault: {
    getConfig: key => key === 'theme' ? themeMode : undefined,
    on: (event, callback) => { vaultEvents.on(event, callback); return () => vaultEvents.off(event, callback); }
  }, workspace: {
    containerEl: window.document.querySelector('.workspace'),
    onLayoutReady: callback => callback(),
    on: (event, callback) => { workspaceEvents.on(event, callback); return () => workspaceEvents.off(event, callback); }
  } };
  const drain = async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      if (!frames.size) return;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback());
    }
    assert.fail('Animation frames did not settle; possible event feedback loop.');
  };
  const unload = () => { plugin.onunload(); plugin.disposers.forEach(dispose => dispose()); };
  const setMode = mode => { themeMode = mode; updateAppTheme(); vaultEvents.emit('config-changed', 'theme'); };
  const setOsDark = value => { osDark = value; if (themeSource === 'system') nativeTheme.emit('updated'); };
  return { plugin, window, nativeTheme, materials, writes, notices, drain, unload, frames, workspaceEvents, setMode, setOsDark };
}

test('only the top strip becomes transparent and lower content/active-tab icons remain intact', async () => {
  const f = fixture(); const doc = f.window.document;
  const lowerBefore = doc.querySelector('.view-content').getAttribute('style');
  f.plugin.onload(); await f.drain();
  assert.equal(f.plugin.status.applied, true);
  assert.deepEqual(f.materials, ['acrylic']);
  assert.equal(f.nativeTheme.themeSource, 'dark');
  assert.match(doc.body.style.backgroundImage, /transparent 40px, rgb\(30, 30, 30\) 40px/);
  assert.equal(doc.querySelector('.view-content').getAttribute('style'), lowerBefore);
  assert.equal(doc.querySelector('#lower').classList.contains('top-strip-acrylic-control'), false);
  assert.equal(doc.querySelector('#active').classList.contains('top-strip-acrylic-control'), false);
  assert.equal(doc.querySelector('#top').classList.contains('top-strip-acrylic-control'), true);
  assert.equal(doc.querySelector('.workspace-leaf-resize-handle').style.clipPath, 'inset(40px 0 0 0)');
  f.unload();
});

test('app dark/light changes align native theme without a native updated feedback loop', async () => {
  const f = fixture(); f.plugin.onload(); await f.drain();
  assert.deepEqual(f.writes, ['dark']);
  f.setMode('moonstone'); await f.drain();
  assert.deepEqual(f.writes, ['dark', 'light']);
  assert.match(f.plugin.style.textContent, /#20242b/);
  f.nativeTheme.emit('updated'); await f.drain();
  assert.deepEqual(f.writes, ['dark', 'light']);
  f.setMode('obsidian'); await f.drain();
  assert.deepEqual(f.writes, ['dark', 'light', 'dark']);
  f.unload();
});

test('unload restores inline values, native source, listeners and cancels queued work', async () => {
  const f = fixture(); const body = f.window.document.body;
  body.style.setProperty('background-color', 'rgb(20, 20, 20)', 'important');
  const before = [body.style.getPropertyValue('background-color'), body.style.getPropertyPriority('background-color')];
  f.plugin.onload(); await f.drain();
  f.workspaceEvents.emit('layout-change'); f.unload(); await f.drain();
  assert.deepEqual([body.style.getPropertyValue('background-color'), body.style.getPropertyPriority('background-color')], before);
  assert.equal(body.style.backgroundImage, '');
  assert.equal(f.nativeTheme.themeSource, 'system');
  assert.deepEqual(f.materials, ['acrylic', 'none']);
  assert.equal(f.nativeTheme.listenerCount('updated'), 1); // The app's own listener remains.
  assert.equal(f.frames.size, 0);
  assert.equal(body.classList.contains('top-strip-acrylic-enabled'), false);
  assert.equal(f.window.document.querySelectorAll('.top-strip-acrylic-control').length, 0);
});

test('another vault/native theme writer does not cause fights or get overwritten on unload', async () => {
  const f = fixture(); f.plugin.onload(); await f.drain();
  f.nativeTheme.themeSource = 'light'; await f.drain();
  assert.deepEqual(f.writes, ['dark', 'light']);
  f.unload(); assert.equal(f.nativeTheme.themeSource, 'light');
});

test('background image conflicts fail once and preserve user styling', async () => {
  const f = fixture({ backgroundImage: true });
  const workspace = f.window.document.querySelector('.workspace'); const before = workspace.getAttribute('style');
  f.plugin.onload(); await f.drain(); f.workspaceEvents.emit('layout-change'); await f.drain();
  assert.equal(workspace.getAttribute('style'), before);
  assert.deepEqual(f.materials, []); assert.deepEqual(f.writes, []);
  assert.equal(f.notices.length, 1); f.unload();
});

test('unsupported layout does not make a broad transparent window', async () => {
  const f = fixture({ top: 100 }); f.plugin.onload(); await f.drain();
  assert.equal(f.plugin.status.applied, false); assert.deepEqual(f.materials, []);
  assert.equal(f.window.document.body.style.backgroundColor, ''); f.unload();
});

test('unsupported operating systems do not alter native APIs or styles', async () => {
  const f = fixture({ windows: false }); f.plugin.onload(); await f.drain(); f.unload();
  assert.deepEqual(f.materials, []); assert.deepEqual(f.writes, []); assert.equal(f.notices.length, 0);
});

test('older Windows builds do not silently claim native Acrylic support', async () => {
  const f = fixture({ osRelease: '10.0.19045' }); f.plugin.onload(); await f.drain();
  assert.equal(f.plugin.status.applied, false); assert.match(f.notices[0], /Windows 11 22H2/);
  assert.deepEqual(f.materials, []); assert.deepEqual(f.writes, []); f.unload();
});

test('switching an explicit theme to follow-system works immediately even if body classes initially stay unchanged', async () => {
  const f = fixture(); f.plugin.onload(); await f.drain();
  assert.equal(f.nativeTheme.themeSource, 'dark');
  f.setMode('system'); await f.drain();
  assert.equal(f.nativeTheme.themeSource, 'system');
  assert.equal(f.window.document.body.classList.contains('theme-light'), true);
  assert.match(f.plugin.style.textContent, /#20242b/);
  f.setOsDark(true); await f.drain();
  assert.equal(f.nativeTheme.themeSource, 'system');
  assert.equal(f.window.document.body.classList.contains('theme-dark'), true);
  assert.match(f.plugin.style.textContent, /#f5f6f8/);
  f.unload();
});

test('loading in follow-system mode never pins Electron to a fixed theme', async () => {
  const f = fixture({ themeMode: 'system' }); f.plugin.onload(); await f.drain();
  assert.equal(f.nativeTheme.themeSource, 'system'); assert.deepEqual(f.writes, []);
  f.setOsDark(true); await f.drain();
  assert.equal(f.window.document.body.classList.contains('theme-dark'), true);
  assert.deepEqual(f.writes, []); f.unload();
});
