// The Model's state: what the agent and the main process know, mirrored in this window. Only the
// agent's answers and events change it; the screens read it through their view models.

export function createStore(api) {
  const data = {
    devices: [], presets: null, apps: null, general: {}, conflicts: [], status: {}, connected: false, appInfo: {},
    history: {}, logs: [], backups: [], ui: {}, agentBusy: false, agentErr: null, agentInfo: null, buildStep: null,
    ready: false, loaded: false, running: null, flow: null, ax: undefined, briStatus: undefined,
    userDevices: [],   // keyboard photos made by their owners (device files, shared/keymap.mjs)
  };
  const device = id => data.devices.find(d => d.id === id) || null;
  let userRead = false;   // the device files are read once, with the first load
  function merge(summary) {
    const i = data.devices.findIndex(x => x.id === summary.id);
    if (i >= 0) data.devices[i] = summary; else data.devices.push(summary);
  }
  // An agent event applied to the data. Answers what changed ({ event, id }), or null when the
  // event changed nothing here (our own save's echo of the settings, an unknown device).
  function applyEvent(event, payload) {
    const d = payload && payload.id !== undefined ? device(payload.id) : null;
    switch (event) {
      case 'device': case 'device_added': merge(payload); return { event, id: payload.id };
      // keep the card, greyed out, so a device that dropped off (asleep, out of range) stays in view
      case 'device_removed': if (d) d.offline = true; return { event, id: payload.id };
      case 'battery': if (!d) return null; d.battery = payload.battery; return { event, id: d.id };
      case 'app': data.status.app = payload.app || ''; return { event };
      // settings changed elsewhere (the ring's Next profile, another window); our own save's echo
      // is identical and changes nothing
      case 'general': if (JSON.stringify(payload || {}) === JSON.stringify(data.general || {})) return null; data.general = payload || {}; return { event };
      case 'profile': if (!d) return null; d.profile = payload.profile; return { event, id: d.id };
      case 'backlight': if (!d || !d.state || !d.state.backlight) return null; d.state.backlight.current_level = payload.level; return { event, id: d.id };
    }
    return null;
  }
  // Flow reports its state whenever it changes (computers found, paired, online)
  function applyFlow(m) { if (m && m.type === 'info' && m.info) data.flow = m.info; }
  return {
    data, device, merge, applyEvent, applyFlow,
    // everything the first paint needs, in one round trip
    async load() {
      const [devices, status, presets] = await Promise.all([api.quiet('devices'), api.quiet('status'), data.presets ? Promise.resolve(data.presets) : api.quiet('presets')]);
      data.devices = devices; data.status = status; data.presets = presets;
      data.general = status.general || {}; data.conflicts = status.conflicts || [];
      data.connected = true; data.loaded = true;
      if (!userRead) { userRead = true; await this.loadUserDevices(); }
    },
    // the rest is not needed to show a device, so it arrives afterwards
    async loadRest() {
      if (!data.apps) api.quiet('applications').then(a => { data.apps = a; }).catch(() => { data.apps = []; });
      try { data.backups = await api.quiet('list_backups'); } catch (e) { data.backups = []; }
      for (const d of data.devices) { try { data.history[d.id] = await api.quiet('battery_history', { id: d.id }); } catch (e) {} }
    },
    async loadUserDevices() { try { data.userDevices = (await api.host.userDevices()) || []; } catch (e) { data.userDevices = []; } },
    async loadLogs() { try { data.logs = (await api.quiet('logs')).map(t => ({ t, c: /WARN/.test(t) ? 'warn' : /ERR|fatal/.test(t) ? 'err' : 'dim' })); } catch (e) { data.logs = []; } },
    async loadFlow() { const f = await api.host.flowInfo(); data.flow = f; return f; },
    async setGeneral(patch) {
      try { data.general = await api.call('set_general', patch); } catch (e) { Object.assign(data.general, patch); }
      api.host.generalChanged();
    },
    // the agent's summary of a device after a change, kept
    async assign(d, section, control, action, profile) { merge(await api.setAssignment(d, section, control, action, profile)); },
  };
}
