// What the parts of the main process share and change: the agent's devices and settings, the
// windows, the window's settings. One object, so a change made in one part is seen by the others.
module.exports = {
  uiSettings: null,   // settings.js
  win: null,   // window.js
  tray: null,   // tray.js
  connected: false,   // agent.js
  devices: [],   // agent.js
  general: {},   // agent.js
  paused: false,   // agent.js
  emojiWin: null,   // emoji.js
  currentApp: '',   // ring.js
  btTimer: null,   // bluetooth.js
  btMode: null,   // bluetooth.js
  I18n: null,   // shared/i18n.mjs: the language in use, t()
  Keymap: null,   // shared/keymap.mjs: keyboard photos made by their owners
};
