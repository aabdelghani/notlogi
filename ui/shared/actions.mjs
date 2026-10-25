// What an action is called and shown as, and the keys it presses: no window, no agent. The
// settings window and the main process name actions the same way.
import { t } from './i18n.mjs';

export const ICON = { macro: 'fa-list-ol', dpi: 'fa-gauge-high', gshift: 'fa-layer-group', battery_level: 'fa-battery-three-quarters', onboard_cycle: 'fa-microchip', native: 'fa-circle-dot', nothing: 'fa-ban', gesture: 'fa-hand-pointer', scroll: 'fa-arrows-left-right', adapter: 'fa-arrows-up-down', keystroke: 'fa-keyboard', button: 'fa-computer-mouse', change_host: 'fa-right-left', dpi_cycle: 'fa-arrow-pointer', command: 'fa-terminal', smartshift_toggle: 'fa-gear', open: 'fa-folder-open', launch: 'fa-rocket', type_text: 'fa-i-cursor', folder: 'fa-folder', ring_profile: 'fa-layer-group', brightness_dial: 'fa-sun' };
export const PRESET_ICON = { primary_click: 'fa-computer-mouse', secondary_click: 'fa-computer-mouse', scroll_up: 'fa-arrow-up', scroll_down: 'fa-arrow-down', scroll_left: 'fa-arrow-left', scroll_right: 'fa-arrow-right', dpi_up: 'fa-gauge-high', dpi_down: 'fa-gauge', dpi_slot_cycle: 'fa-arrows-rotate', dpi_shift: 'fa-diamond', dpi_default: 'fa-crosshairs', dpi_goto_shift: 'fa-diamond', gshift: 'fa-layer-group', battery_level: 'fa-battery-three-quarters', onboard_profile_cycle: 'fa-microchip', action_ring: 'fa-circle-notch', volume_dial: 'fa-volume-high', overview: 'fa-table-cells-large', show_desktop: 'fa-desktop', home_show_desktop: 'fa-desktop', screen_capture: 'fa-camera', eject: 'fa-eject', do_not_disturb: 'fa-moon', app_switcher: 'fa-window-restore', workspace_next: 'fa-arrow-right', workspace_prev: 'fa-arrow-left', tab_next: 'fa-arrow-right-long', tab_prev: 'fa-arrow-left-long',
  copy: 'fa-copy', paste: 'fa-paste', undo: 'fa-rotate-left', redo: 'fa-rotate-right', zoom_in: 'fa-magnifying-glass-plus', zoom_out: 'fa-magnifying-glass-minus', volume_up: 'fa-volume-high', volume_down: 'fa-volume-low', mute: 'fa-volume-xmark',
  mic_mute: 'fa-microphone-slash', play_pause: 'fa-play', next_track: 'fa-forward-step', prev_track: 'fa-backward-step', brightness_up: 'fa-sun', brightness_down: 'fa-sun', screenshot: 'fa-camera', screenshot_area: 'fa-crop-simple', lock: 'fa-lock',
  calculator: 'fa-calculator', emoji: 'fa-face-smile', emoji_picker: 'fa-face-smile', context_menu: 'fa-bars', dictation: 'fa-microphone', terminal: 'fa-terminal', close_window: 'fa-xmark', maximize: 'fa-window-maximize', minimize: 'fa-window-minimize', tile_left: 'fa-table-columns', tile_right: 'fa-table-columns',
  hscroll: 'fa-arrows-left-right', vscroll: 'fa-arrows-up-down', zoom_wheel: 'fa-magnifying-glass-plus', volume_wheel: 'fa-volume-high', tabs_wheel: 'fa-window-restore', workspaces_wheel: 'fa-table-cells-large', brightness_wheel: 'fa-sun',
  easy_switch_1: 'fa-right-left', easy_switch_2: 'fa-right-left', easy_switch_3: 'fa-right-left', dpi_cycle: 'fa-arrow-pointer', smartshift_toggle: 'fa-gear', open_home: 'fa-folder-open', middle_click: 'fa-computer-mouse', back: 'fa-arrow-left', forward: 'fa-arrow-right', native: 'fa-circle-dot', nothing: 'fa-ban',
  gesture_navigation: 'fa-hand-pointer', gesture_windows: 'fa-hand-pointer', gesture_volume: 'fa-hand-pointer', gesture_pan: 'fa-hand-pointer' };

// the agent's preset table (presets.all), when known, gives a preset its label and type
const presetOf = (presets, k) => (presets && presets.all && presets.all[k]) || {};

// Icon for an assignment: the preset's own icon, else its type's, and the key's printed function
// only while the key is left to the device.
export function assignIcon(a, native, presets) {
  if (!a || a === 'native') return native;
  if (typeof a === 'string') return PRESET_ICON[a] || ICON[presetOf(presets, a).type] || native;
  return ICON[a.type] || native;
}
export const actionIcon = (a, presets) => typeof a === 'string' ? (PRESET_ICON[a] || ICON[presetOf(presets, a).type] || 'fa-circle-dot') : ICON[(a || {}).type] || 'fa-circle-dot';

// a key's name as printed, the modifier keys named as on this OS ('linux', 'win32', 'darwin')
export function keyName(k, os = 'linux') {
  const meta = os === 'win32' ? 'Win' : os === 'darwin' ? 'Cmd' : 'Super', alt = os === 'darwin' ? 'Option' : 'Alt';
  return k.replace(/^KEY_/, '').replace(/^LEFT(CTRL|SHIFT|ALT|META)$/, '$1').replace(/^RIGHT(CTRL|SHIFT|ALT|META)$/, '$1').replace('META', meta).replace(/^ALT$/, alt).replace('CTRL', 'Ctrl').replace('SHIFT', 'Shift').replace('ALT', 'Alt').replace(/^([A-Z])$/, '$1').replace(/^([A-Z][A-Z]+)$/, m => m.charAt(0) + m.slice(1).toLowerCase());
}

export function presetLabel(a, presets, os) {
  if (!a || a === 'native') return t('Default');
  // labels from the agent's preset table, and the ones LogiMX stores in English, shown translated
  if (typeof a === 'string') { const l = presetOf(presets, a).label; return l ? t(l) : a; } // i18n: data
  if (a.type === 'keystroke') return a.label ? t(a.label) : (a.keys || []).map(k => keyName(k, os)).join(' + '); // i18n: data
  if (a.type === 'command') return t('Run: {cmd}', { cmd: a.cmd || '' });
  if (a.type === 'gesture') return a.label ? t(a.label) : t('Custom gestures'); // i18n: data
  if (a.type === 'launch') return t('Launch {app}', { app: a.label || a.app });
  if (a.type === 'type_text') return t('Type: {text}', { text: (a.text || '').slice(0, 24) });
  if (a.type === 'open') {
    // the picker stores 'Open <target>' in English: shown in the language in use
    const shown = (a.target || '').replace(/^https?:\/\//, '').slice(0, 24);
    if (!a.label) return t('Open {target}', { target: a.target || '' });
    return a.label === 'Open ' + shown ? t('Open {target}', { target: shown }) : t(a.label); // i18n: data
  }
  if (a.type === 'scroll') return a.label ? t(a.label) : (a.axis === 'x' ? t('Horizontal scroll') : t('Vertical scroll')); // i18n: data
  if (a.type === 'button') return a.label ? t(a.label) : t('{button} click', { button: a.button.replace('BTN_', '') }); // i18n: data
  if (a.type === 'nothing') return t('Disabled');
  if (a.type === 'macro') return t('Macro: {name}', { name: a.label || '' });
  return a.label ? t(a.label) : a.type; // i18n: data
}

// what the agent calls another tool, as people know it
export const toolName = n => ({ solaar: 'Solaar', logid: 'logid', logioptionsplus_agent: 'Logi Options+', 'Logi Options+': 'Logi Options+', LogiOptions: 'Logitech Options', LogiOptionsMgr: 'Logitech Options',
  LogiMgrDaemon: 'Logitech Options', SetPoint: 'SetPoint', 'LGHUB Agent': 'G HUB', lghub_agent: 'G HUB' })[n] || n;

// ------------------------------------------------------------------ keys
export const CODE_MAP = { ControlLeft: 'KEY_LEFTCTRL', ControlRight: 'KEY_RIGHTCTRL', ShiftLeft: 'KEY_LEFTSHIFT', ShiftRight: 'KEY_RIGHTSHIFT',
  AltLeft: 'KEY_LEFTALT', AltRight: 'KEY_RIGHTALT', MetaLeft: 'KEY_LEFTMETA', MetaRight: 'KEY_RIGHTMETA', OSLeft: 'KEY_LEFTMETA', OSRight: 'KEY_RIGHTMETA',
  Space: 'KEY_SPACE', Enter: 'KEY_ENTER', Tab: 'KEY_TAB', Backspace: 'KEY_BACKSPACE', Delete: 'KEY_DELETE', Insert: 'KEY_INSERT',
  Home: 'KEY_HOME', End: 'KEY_END', PageUp: 'KEY_PAGEUP', PageDown: 'KEY_PAGEDOWN', ArrowUp: 'KEY_UP', ArrowDown: 'KEY_DOWN', ArrowLeft: 'KEY_LEFT', ArrowRight: 'KEY_RIGHT',
  Minus: 'KEY_MINUS', Equal: 'KEY_EQUAL', BracketLeft: 'KEY_LEFTBRACE', BracketRight: 'KEY_RIGHTBRACE', Backslash: 'KEY_BACKSLASH', Semicolon: 'KEY_SEMICOLON',
  Quote: 'KEY_APOSTROPHE', Backquote: 'KEY_GRAVE', Comma: 'KEY_COMMA', Period: 'KEY_DOT', Slash: 'KEY_SLASH', CapsLock: 'KEY_CAPSLOCK', PrintScreen: 'KEY_SYSRQ',
  ScrollLock: 'KEY_SCROLLLOCK', Pause: 'KEY_PAUSE', ContextMenu: 'KEY_COMPOSE', NumLock: 'KEY_NUMLOCK', NumpadAdd: 'KEY_KPPLUS', NumpadSubtract: 'KEY_KPMINUS',
  NumpadMultiply: 'KEY_KPASTERISK', NumpadDivide: 'KEY_KPSLASH', NumpadEnter: 'KEY_KPENTER', NumpadDecimal: 'KEY_KPDOT', AudioVolumeUp: 'KEY_VOLUMEUP',
  AudioVolumeDown: 'KEY_VOLUMEDOWN', AudioVolumeMute: 'KEY_MUTE', MediaPlayPause: 'KEY_PLAYPAUSE', MediaTrackNext: 'KEY_NEXTSONG', MediaTrackPrevious: 'KEY_PREVIOUSSONG', IntlBackslash: 'KEY_102ND' };
export const MODS = new Set(['KEY_LEFTCTRL', 'KEY_RIGHTCTRL', 'KEY_LEFTSHIFT', 'KEY_RIGHTSHIFT', 'KEY_LEFTALT', 'KEY_RIGHTALT', 'KEY_LEFTMETA', 'KEY_RIGHTMETA']);
export function codeToKey(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return 'KEY_' + m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return 'KEY_' + m[1];
  if ((m = /^F(\d{1,2})$/.exec(code))) return 'KEY_F' + m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return 'KEY_KP' + m[1];
  return CODE_MAP[code] || null;
}
// a shortcut typed as text ("ctrl + shift + t") as the keys it presses; nothing for blank text
export const typedKeys = s => s && s.trim() ? s.split('+').map(k => 'KEY_' + k.trim().toUpperCase().replace(/^CTRL$/, 'LEFTCTRL').replace(/^SHIFT$/, 'LEFTSHIFT').replace(/^ALT$/, 'LEFTALT').replace(/^SUPER$|^META$|^WIN$/, 'LEFTMETA')) : null;
