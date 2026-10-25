// View model: prompts, wishes and problem reports.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let IS_MAC, IS_WIN, S, VERSION, api, call, changed, fx, loadLogs, toast;
export function link(ctx) { ({ IS_MAC, IS_WIN, S, VERSION, api, call, changed, fx, loadLogs, toast } = ctx); }

// the screen state this view model owns: the prompt, confirmation, wish and report being filled in
export const state = {
  prompt: undefined, confirm: undefined, wish: undefined, report: undefined, uninstall: undefined,
};

// The report goes into a public issue, so it is shown in full before anything leaves the machine
// and it is the person who submits it, signed in to their own account in the browser.
const ISSUE_URL = 'https://github.com/aabdelghani/notlogi/issues/new';
function reportBody(r, withLog) {
  return `### What happened\n\n${(r.what || '').trim() || '<!-- What did you do, what did you expect, what happened instead? -->'}\n\n### Diagnostics\n\n${r.summary}\n` +
    (withLog && r.log ? `\n<details><summary>Agent log, last lines</summary>\n\n\`\`\`\n${r.log}\n\`\`\`\n\n</details>\n` : withLog ? '' : '\n_The agent log was too long for the link: it is on the clipboard, paste it here._\n');
}
// A wish: a feature request in its own words, with only the version, system and devices beside it
function wishBody(w) {
  const devs = S.devices.map(d => d.name).join(', ') || 'none connected';
  return `### My wish\n\n${(w.what || '').trim()}\n\n### Setup\n\nNotLogi ${S.status.version || VERSION} on ${IS_WIN() ? 'Windows' : IS_MAC() ? 'macOS' : 'Linux'} · devices: ${devs}\n`;
}
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'prompt-ok': async (it, e, d, key) => { const p = S.prompt; const vals = {}; for (const f of p.fields) vals[f.key] = f.value || ''; S.dlg = p.back || null; await p.onOk(vals); return; },
  'report': async (it, e, d, key) => { S.report = { what: '' }; S.dlg = 'report'; changed(); const r = await api.host.diagReport(); S.report = Object.assign({ what: (S.report || {}).what || '' }, r); if (S.dlg === 'report') changed(); return; },
  'wish': async (it, e, d, key) => { S.menu = null; S.wish = { what: '' }; S.dlg = 'wish'; changed(); fx.focus('textarea[data-field=wish]', { delay: 50 }); return; },
  'wish-open': async (it, e, d, key) => {
    const w = S.wish, what = ((w && w.what) || '').trim(); if (!what) return;
    const title = 'Wish: ' + (what.split('\n')[0].length > 70 ? what.split('\n')[0].slice(0, 67) + '…' : what.split('\n')[0]);
    api.host.openExternal(`${ISSUE_URL}?labels=enhancement&title=${encodeURIComponent(title)}&body=${encodeURIComponent(wishBody(w))}`);
    S.dlg = null; toast(t('Wish received by the genie! Submit it on GitHub and the 24-hour clock starts')); changed(); return;
  },
  // Remove NotLogi: the plan is fetched again when the settings switch changes; the app ends on success
  'uninstall': async (it, e, d, key) => { S.uninstall = { settings: false }; S.dlg = 'uninstall'; changed(); const p = await api.host.uninstallPlan(false); if (S.dlg === 'uninstall') { S.uninstall = Object.assign({}, S.uninstall, p); changed(); } return; },
  'uninstall-settings': async (it, e, d, key) => { const u = S.uninstall || {}; u.settings = !u.settings; S.uninstall = u; changed(); const p = await api.host.uninstallPlan(u.settings); if (S.dlg === 'uninstall') { S.uninstall = Object.assign({}, S.uninstall, p); changed(); } return; },
  'uninstall-go': async (it, e, d, key) => { const u = S.uninstall; if (!u || u.busy) return; u.busy = true; changed(); const r = await api.host.uninstall(!!u.settings); if (!r || !r.ok) { u.busy = false; S.dlg = null; toast(t('Not everything could be removed'), true); changed(); } return; },
  'report-copy': async (it, e, d, key) => { api.host.copy(reportBody(S.report, true)); toast(t('Report copied')); return; },
  'report-open': async (it, e, d, key) => {
    const r = S.report; if (!r || !r.summary) return;
    // a link can only carry so much: past that the log travels on the clipboard instead
    let body = reportBody(r, true), full = true;
    if (encodeURIComponent(body).length > 6000) { body = reportBody(r, false); full = false; api.host.copy('```\n' + r.log + '\n```'); }
    api.host.openExternal(`${ISSUE_URL}?title=${encodeURIComponent(r.title)}&body=${encodeURIComponent(body)}`);
    S.dlg = null; toast(full ? t('Issue opened in your browser') : t('Issue opened; the log is on the clipboard to paste'), false); changed(); return;
  },
  'export-diag': async (it, e, d, key) => { const diag = { status: S.status, devices: S.devices, config: await call('export_config'), logs: S.logs, ui: S.ui, when: new Date().toISOString() }; const p = await api.host.saveJson('logimx-diagnostics.json', diag); if (p) toast(t('Saved {path}', { path: p })); return; },
  'copy-diag': async (it, e, d, key) => { api.host.copy(S.logs.map(l => l.t).join('\n') || JSON.stringify(S.status)); toast(t('Copied')); return; },
  'refresh-logs': async (it, e, d, key) => { await loadLogs(); changed(); return; },
};

export const provide = { ISSUE_URL, reportBody, wishBody };
