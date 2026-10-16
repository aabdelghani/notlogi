// LogiMX UI: Electron main process. Talks to the C++ agent over a Unix socket (a named pipe on
// Windows), keeps a tray indicator with battery levels and raises low battery notifications.
const { app, globalShortcut } = require('electron');
const plat = require('./platform');
// Linux on Wayland: through XWayland, as up to 0.12.0 (Electron 33). Electron 38 and later choose
// native Wayland by themselves, before this file runs, and there a window can be neither placed nor
// kept on top, nor told where the pointer is: the action ring, the emoji picker and the notices opened
// in the wrong place, behind other windows, or not at all. So the app starts once more, at once, on
// X11. Native Wayland stays available: start it with --ozone-platform=wayland.
const restarting = plat.IS_LINUX && !!process.env.DISPLAY && app.commandLine.getSwitchValue('ozone-platform') === 'wayland' &&
  !process.argv.some(a => /^--ozone-platform(-hint)?(=|$)/.test(a));
if (restarting) {
  // Not app.relaunch: Electron's relauncher starts the new process with no_new_privs set, which
  // disarms the setuid sandbox helper, and where that helper is the only sandbox allowed (Ubuntu
  // 24.04 and later keep unprivileged user namespaces from ordinary programs) the restarted app
  // died at once, without a word (0.12.4, #16). A plain child process, left on its own, inherits
  // nothing of the kind. An AppImage is unmounted when this process ends: it starts itself again.
  const exe = process.env.APPIMAGE || process.execPath;
  require('child_process').spawn(exe, process.argv.slice(1).concat(['--ozone-platform=x11']), { detached: true, stdio: 'ignore', env: Object.assign({}, process.env, { NOTLOGI_RESTARTED: 'wayland' }) }).unref();
  app.exit(0);
}
const flow = require('./flow');
// People see NotLogi; settings stay in the folder earlier versions used (LogiMX), so an update keeps them
app.setName('NotLogi');
app.setPath('userData', require('path').join(app.getPath('appData'), 'LogiMX'));
// Windows ties notifications to the Start-menu shortcut through this id (the installer sets it)
if (plat.IS_WIN) app.setAppUserModelId('io.github.aabdelghani.logimx');
// The main process in parts (main/), loaded once the app's name and settings folder are set;
// each one gets what it uses from the others.
const parts = ['env', 'settings', 'window', 'tray', 'agent', 'osd', 'battery', 'emoji', 'ring', 'media', 'bluetooth', 'system', 'autostart', 'i18n'].map(n => require('./main/' + n));
const state = require('./main/state');
const ctx = Object.assign({}, ...parts.map(p => p.provide));
parts.forEach(p => p.link(ctx));
const { applyLanguage, rpc, btSetMode, btStopScan, connect, createTray, createWindow, ensureAutostart, ensureDesktopEntry, loadUi, registerShortcuts, saveUi, showWindow, startAgent, warmRing } = ctx;
// the logic shared with the windows (ES modules in shared/, loaded before the app starts)
const sharedReady = Promise.all([import('./shared/ring.mjs'), import('./shared/battery.mjs'), import('./shared/i18n.mjs')]).then(([r, b, i]) => { state.Ring = r; state.Battery = b; state.I18n = i; });
app.isQuitting = false;

// (a process restarting on X11 takes neither the lock nor anything else: the new one does)
const single = !restarting && app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);   // macOS: the Dock icon was clicked
  app.whenReady().then(async () => {
    plat.inputMonitoring(true);   // macOS, before anything asks about Accessibility: lists NotLogi under Input Monitoring and asks once, for the MX Keys
    await sharedReady;
    ensureDesktopEntry();
    ensureAutostart();
    setTimeout(() => { startAgent().catch(() => {}); }, 600);
    state.uiSettings = loadUi();
    applyLanguage();
    if (state.uiSettings.tray !== false) createTray();
    connect();
    createWindow();
    flow.init({ win: state.win, rpc, getUi: () => (state.uiSettings = state.uiSettings || loadUi()), setUi: p => { state.uiSettings = state.uiSettings || loadUi(); Object.assign(state.uiSettings, p); saveUi(state.uiSettings); } });
    try { registerShortcuts(); } catch (e) {}
    btSetMode();
    // the action ring's window, made, loaded and shown once ahead (see warmRing) so the first press
    // opens it like any other, where the pointer is
    setTimeout(() => { try { warmRing(); } catch (e) {} }, 1500);
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); flow.shutdown(); });
  app.on('window-all-closed', () => { /* stay in the tray */ });
  app.on('before-quit', () => { app.isQuitting = true; flow.shutdown(); state.btMode = null; clearTimeout(state.btTimer); btStopScan(); });
}
