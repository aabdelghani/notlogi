# NotLogi architecture

NotLogi has two programs. The **agent** (C++, `agent/`) owns the devices and runs the actions. The
**app** (Electron, `ui/`) is the window, the tray and the overlays. They talk JSON-RPC over a local
socket, and the agent pushes events (devices, battery, the focused application) back.

The app follows **MVVM**: Model, view models, views.

```
            ┌──────────────────────────── Model ────────────────────────────┐
  agent ◄──►│ main process (ui/main/)   model/api.js   model/store.js       │
 (devices,  │ socket, RPC, events,      every request  what the agent and   │
  config,   │ system services           goes here      main process know    │
  actions)  │                  shared/ (rings, profiles, actions, battery)  │
            └───────────────────────────────┬───────────────────────────────┘
                                            │ data, events
                              ┌─────────────▼─────────────┐
                              │  View models (vm/)        │  screen state, what follows
                              │  commands by data-act     │  from it, commands
                              └─────────────┬─────────────┘
                                 changed()  │  ▲ commands, setField, ...
                              ┌─────────────▼──┴──────────┐
                              │  Views (view/)            │  HTML from the view models,
                              │  render, bind, fx         │  input turned into commands
                              └───────────────────────────┘
```

## Model

- **The agent** (`agent/src`) holds the devices, their settings and profiles (`config.json`), the
  action engine and the profile chosen for the focused application. It is the source of truth.
- **The main process** (`ui/main.js`, `ui/main/*.js`) holds the agent connection and the system
  services the windows need. Each part is one file:
  - `agent.js`: the socket, RPC and events; starting or building the agent.
  - `window.js`, `tray.js`, `osd.js`, `emoji.js`, `ring.js`, `bluetooth.js`: windows and overlays.
  - `media.js`: volume and brightness.
  - `battery.js`: battery notices.
  - `settings.js`: the window's own settings file.
  - `autostart.js`, `system.js`: autostart, the clean-up of older installs, app icons, updates and the problem report.
  - `devices.js`: keyboard photos made by their owners, one device file each in the `devices` folder,
    and the photo picked for one.
  - `uninstall.js`, `uninstall-plan.js`: Remove NotLogi. The plan (what goes, by kind of install) has no Electron in it and is tested; `packaging/uninstall.sh` does the same from a terminal.
  - `state.js`: what the parts share and change: devices, settings, windows.
  - `../flow.js`: Flow. NotLogi on each computer finds the others on the local network (UDP 24871),
    pairs with a shared key, and when the pointer is pushed against the edge facing another computer,
    hands it the clipboard (TCP 24871, signed) and switches the mouse and keyboard to its channel.
  - `main.js`: sets the app up and links the parts.
- **`ui/renderer/model/api.js`** is the only way from the settings window to the agent and the
  main process. **`model/store.js`** keeps what they know (devices, presets, settings, status) and
  applies their events.
- **`ui/shared/`** holds logic both processes need, as ES modules without any window:
  - `ring.mjs`: which ring an application gets, its slots and folders, and what is saved.
  - `profiles.mjs`: application profiles falling back to the global one.
  - `actions.mjs`: action names and icons, key names, typed shortcuts.
  - `battery.mjs`: the low and critical levels, icons and words.
  - `keymap.mjs`: a keyboard photo made by its owner: the keys to place and in what order, the device
    file it is kept and shared as, and the check of a file someone else made.

## View models

`ui/renderer/vm/*.js`, one per area:
- `shell`: page, device, dialogs, menus, first run.
- `picker`: the action picker.
- `ring`: the action ring settings.
- `gestures`, `device`, `profiles`, `pair`, `dialogs`, `settings`, `flow`.
- `keymap`: a keyboard's own photo being made, shared, imported or removed.
- `core`: what every screen uses.

Each view model:
- declares the screen **state** it owns (`export const state = {...}`);
- derives what the screens show from that state and the store;
- exports its **commands** by the `data-act` name of the buttons that run them. A command receives
  plain data (the button's `data-*`, its value, whether it is on), never an element.

A view model changes state and calls `changed()` to have the window drawn again. When it needs an
effect on the page (focus a field, mark a pick in a long list without redrawing it) it asks `fx`.
It never reads or touches the page itself.

## Views

`ui/renderer/view/*.js`:
- **Templates** draw the page from the view models as HTML.
- **`render.js`** draws the window and wires the drawn page:
  - it batches redraws to one per frame;
  - a field being typed in keeps its text, caret and focus through a redraw.
- **`dispatch.js`** turns a click or change into data for the command of its `data-act`.
- **`fx.js`** is the small set of page effects the view models may ask for.

Views do not call the Model and do not write state. Typed text goes through `setField`, hover and
drops through view-model methods.

The overlays (`renderer/ring.js` with `ring-geometry.js`, `btpop.js`, `tray.js`, `osd.js`,
`emoji.js`) are small views of their own, fed by the main process.

## Rules, checked by `npm test`

`ui/test/structure.test.mjs` fails when:
- a view model touches the page;
- a view calls the Model or writes state;
- the Model refers to screens;
- a name is used but never defined;
- a module links a name that no other module offers.

The other tests cover the shared logic and the ring geometry.

## Adding something

- **A button:** give it `data-act="name"` in a view, and add `'name': async (it, e, d, key) => {...}`
  to the view model that owns the state it changes.
- **A screen:** a view model in `vm/` (its `state`, `commands`, `provide`) and a view in `view/`;
  add both to `MODULES` in `app.js`.
- **Logic the main process needs too:** put it in `shared/`.

## Checks while changing the window

```
cd ui
npm test                                  # shared logic, ring geometry, structure
python3 test/visual/walk.py OUT           # screenshots of every page in both themes (app started
python3 test/visual/walk.py --diff A B    #   with --remote-debugging-port=9333), and a comparison
python3 test/visual/behave.py             # real commands through the window; settings backed up and restored
```

## Known leaks of the window into the agent

These sit in the agent but serve only the window. They are left as they are:
- `skip_taskbar` is an X11 hint for the app's own windows.
- The `general` settings are mostly the window's own: notices, the ring's profiles, sizes and
  travel. Of these, the agent uses only `ring.free_pointer`.
- `action` events carry on-screen notice kinds.
- `haptic_cue` takes the ring's cue names.
