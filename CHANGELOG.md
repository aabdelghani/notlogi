# Changelog

Every release of NotLogi (formerly LogiMX), newest first. Downloads are on each version's
[release page](https://github.com/aabdelghani/notlogi/releases).

## [0.14.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.14.1) - 2026-10-29

- PRO X3 SUPERSTRIKE onboard memory: **Save NotLogi's settings here** works on a mouse whose onboard directory was never written (one G HUB never set up) instead of stopping with "the onboard directory does not read back whole": the directory is started afresh, as G HUB does, keeping every profile already on the mouse. A sector that reads back torn is read again, and **Restore all** and a new profile start from the factory profile, which the mouse keeps without a CRC of its own ([#22](https://github.com/aabdelghani/notlogi/issues/22)).

## [0.14.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.14.0) - 2026-10-27

- A keyboard NotLogi has no photo of gets every key it reports in a list, each with its action, and a photo of its owner's: choose a photo, click each key on it as NotLogi names them (the Easy-Switch keys too), and it is drawn like the keyboards NotLogi comes with. **Share** saves it as one device file with the photo inside, and **Import a device file** takes one in ([#19](https://github.com/aabdelghani/notlogi/discussions/19)).

## [0.13.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.13.1) - 2026-10-27

- Signature K650 and K650 for Business: their own photo with every key that can be set (the F row with its browser keys, the media buttons, Home, End, Page up and Page down), and defaults like the MX Keys S without a backlight ([#19](https://github.com/aabdelghani/notlogi/discussions/19)).

## [0.13.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.13.0) - 2026-10-25

- PRO X3 SUPERSTRIKE: the mouse with what G HUB offers for it (its online parts left out), on its LIGHTSPEED receiver or its cable. Sensitivity: G HUB's eleven presets and presets of one's own, five DPI slots with the default and DPI shift slots, X and Y apart, lift-off distance, report rate per link, HERO sensor calibration against another mouse, and a Sensitivity tool (an aiming game). HITS: each main button on its own or both, drawn as G HUB draws them, actuation point, rapid trigger and click haptics, presets, the HITS code G HUB shares, and the HITS latency test with the button's travel shown live. Assignments: G HUB's button names and System actions (DPI up, down, cycle, shift and default, scroll, battery level, onboard profile cycle), a G-Shift layer, and macros recorded in the window (played once, while held, or on and off). Scroll wheel: BHOP. Settings: Gaming surface mode, the onboard memory (use it, pick a profile, write NotLogi's settings into one, restore them all; backed up first), time left and power use from the mouse's power model, the receiver's firmware. An app profile can carry a sensitivity of its own.
- Overlays for a DPI change (with its slot), the battery level and the onboard profile.
- A gaming mouse's Assignments and Profiles pages name its buttons as G HUB does; the window keeps a device's settings on show while it sleeps.
- Remove NotLogi: About → Remove NotLogi lists what goes and takes it away: the agent and its login service, start at login, the launcher and icons, then the program itself (the .deb through one password prompt, the AppImage file; on macOS the bundle goes to the Trash and its permissions are reset, on Windows the setup's uninstaller runs). Settings, profiles and backups stay unless the switch says otherwise. On Linux `logimx-uninstall [--all]` does the same from a terminal.
- Linux: leftovers of older installs are cleaned up when the app starts and when the package is installed: a second launcher and icons from a checkout or an AppImage beside the .deb (two NotLogi in the app grid), a launcher whose program is gone, a user service shadowing the package's, an old rule and binaries under /etc and /usr/local. Start agent at login now drives the package's own service.

## [0.12.5](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.5) - 2026-10-16

- Linux on Wayland: 0.12.4 did not open at all on Ubuntu 24.04 and later (#16). The restart onto XWayland went through Electron's relauncher, which leaves the new process unable to use the setuid sandbox, the only sandbox those systems allow, so it died at once and silently. The app now starts itself as a plain child process.
- The problem report names how the process was started (flags, display backend, a restart, sandbox state), the state of the windows and tray, Chromium and GPU details, and crashes or uncaught errors in the main process.

## [0.12.4](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.4) - 2026-10-13

- Linux on Wayland: the action ring did not appear, and the window opened in the middle of the first screen. Since 0.12.3 (Electron 44) the app ran natively on Wayland, where a window can be neither placed nor kept on top; it runs through XWayland again, as up to 0.12.0. `--ozone-platform=wayland` still starts it on Wayland.
- macOS with two displays: the action ring opened on the main display only. Its window now covers the display under the pointer.

## [0.12.3](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.3) - 2026-10-09

- Double-click: a button preset that double-clicks the left button on one press (#15).
- Backlight: a Stay on while plugged in switch, which keeps the light two hours after the last key, the most the keyboard allows (#15).

## [0.12.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.2) - 2026-10-09

- macOS: releases are signed with a Developer ID and notarized. Permissions granted (Accessibility, Input Monitoring) now survive updates: signed ad hoc, every release was a new app to macOS and the switches left on for the previous one no longer applied (#14). The app opens without right-click > Open. Updating from an earlier release: remove NotLogi from Accessibility with − and add it again with +, once.
- macOS: one banner per missing permission, saying what to do when the switch is already on; Input Monitoring is only asked for while no device is reachable; the window looks again every few seconds, so a banner goes as soon as the permission is granted.
- Home screen and Flow page: the layout was broken by five CSS comments left open; fixed.
- Action ring: centred on the pointer itself on macOS and Windows (a little above it), and the pointer read from the agent on macOS.
- macOS: the menu bar icon is 18 points like the system's own; Stop for Logi Options+ unloads its launchd job, so it stays stopped.
- Add device over the system's Bluetooth (macOS, Windows): the dialog waits for the device and opens its page when it connects; the receiver choice is greyed out when no receiver is plugged in.
- Repository: changelog, security policy, issue and pull request templates, code of conduct, agent tests, lint and formatting.

## [0.12.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.1) - 2026-10-08

- AppImage: built with the current AppImage runtime (no libfuse2 needed) and with update information, so AppImageUpdate and similar tools can update it; its .zsync is attached.
- README: shorter, features first, with Flow at the top.

## [0.12.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.12.0) - 2026-10-07

- Action ring page: the full ring editor wherever the ring is opened (also with no mouse connected): the big ring, a slot's ⋯ makes a folder, the folder's actions on a second circle, ring profiles in the top bar.
  - The action panel opens with the ring and stays open while you click around the ring.
  - Leaving a folder animates again: the ring grows back out and the folder pulses.
  - On the ring itself, a folder's actions no longer show a dark corner.
- The mouse's Back and Forward buttons move through the NotLogi window.
- With a panel open on the right, the profiles and Add application move to its left; the close button stays.
- High-resolution wheel off by default (kept on where Linux's Logitech driver needs it).
- The haptic panel's own function is no longer first in its Recommended list.
- The Flow page keeps its size while it slides in.
- README: Flow and ring folder screenshots.

## [0.11.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.11.0) - 2026-10-07

- Flow: use one mouse and keyboard on several computers running NotLogi on the same network. Push the pointer against the screen edge facing the other computer and the mouse, keyboard and clipboard move there.
  - Guided setup: Add computer, then Continue on both computers to find and pair them.
  - Drag the computers to where their screens sit (above, left, right or below).
  - Settings: move cursor to edge or hold Ctrl, link keyboard, share clipboard.
- Faster device reconnects: a known device is not read again (its tables are kept by firmware), devices set up side by side.
- Side panels leave the profile icons and the close button in place.
- Keyboards no longer show a Flow page.

## [0.10.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.10.1) - 2026-10-06

- New app and tray icon.
- Scroll wheel: the wheel ratchets by default; SmartShift is its own switch, and when on, a slider sets how hard a flick frees the wheel.
- Momentum no longer adds to a free-spinning wheel (it kept scrolling after the wheel stopped).

## [0.10.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.10.0) - 2026-10-06

- Languages: the 19 languages Options+ offers (Settings, Language), following the system language by default.
- Smooth scrolling for the scroll wheel and the thumb wheel, played in time with the display, with momentum after a quick flick.
- Scroll speed for the scroll wheel.

## [0.9.3](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.3) - 2026-10-06

Fixes from #3:

- Battery on older keyboards (e.g. the original MX Keys): while charging it shows Charging instead of 0% and Low.
- Action ring: opens on the first press.

## [0.9.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.2) - 2026-10-06

### New
- **A logo of its own**: the penguin with a mouse is the app icon (window, desktop launcher,
  notifications, Windows and macOS installers, .deb) and the tray icon, with an outlined version
  for dark top bars and dark themes.

### License
- From this release NotLogi is **free software under the GNU GPL, version 3 or later**: use, study,
  share and change it for any purpose, including at work. If you distribute it or a program built on
  it, you share the source under the same license. A separate commercial license is available for
  building NotLogi into a closed product: get in touch through
  [github.com/aabdelghani](https://github.com/aabdelghani). Contributions are welcome; see
  CONTRIBUTING.md. Earlier releases keep their licenses (MIT up to 0.8.2, PolyForm Noncommercial
  for 0.9.0 and 0.9.1).

Everything else is as in [0.9.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.1).

## [0.9.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.1) - 2026-10-06

### New
- **MX Anywhere 3S** (product id b037, over a Bolt receiver or Bluetooth): its photo with the
  middle, back and forward buttons and the SmartShift button marked, Easy-Switch on a photo of its
  underside, its own defaults (1000 DPI, SmartShift on, buttons left to the mouse), and its photo in
  the Bluetooth pairing pop-up. Not yet tested on a real unit: reports welcome.

### Other
- Commercial license requests now go through [github.com/aabdelghani](https://github.com/aabdelghani).

Everything else is as in [0.9.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.0).

## [0.9.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.9.0) - 2026-10-05

### New
- **Action ring folders.** A slot's ⋯ menu makes it a folder of up to eight more actions. On the
  ring, hovering a folder opens its actions on a second circle around it; in the settings, a
  folder has its own page where actions are added at either end of the row and the folder's name
  is edited in place.
- **Ring profiles for everything.** The action ring view has its own profiles in the top bar; an
  application can use any of them. Hovering an application previews its ring or gestures.
- **A ready-made ring for new installs**: Overview, Volume, Play/Pause, Screenshot area, Show
  desktop, Emoji picker, Lock screen and Calculator. Existing rings are not touched.
- **MX Master 4 Easy-Switch** on a photo of its underside: each channel's computer beside its
  light; switch, pair or rename from there.
- **Recommended actions like Options+**: lists tailored to the application (browsers, LibreOffice
  Writer, Calc and Impress, Zoom, Teams), the action ring on keyboard keys, and more.
- **Drag and drop**: drag an action from the panel onto a gesture direction or a ring slot.

### Changes
- **Home** shows every device in one row across the window, each in a column of its own. When
  they do not all fit, the row scrolls with large round arrows or the arrow keys.
- A device that is not connected shows an **Inactive** tag and a button to remove it from the
  list. Its settings are kept, and it comes back when it connects again.
- The header's ⋯ menu is gone. Notifications, Backup & sync, Profiles and About open from a new
  **More** section at the bottom of Settings.

### Fixes
- Renaming a ring folder: the action panel's search box no longer takes the cursor away while
  you type, and a field keeps its text and caret when the window updates in the background.
- The window's own icon is back after the rename to NotLogi.
- Ring folder actions no longer overlap on the settings page.
- A selected button label stays readable on the mouse photo.

### Under the hood
- The app is now built in layers (MVVM): the Model (agent requests and the data it reports), view
  models for each screen, and views that only draw. The main process is split into parts. Rules
  between the layers are checked by `npm test`. See `docs/ARCHITECTURE.md`.

### License
From this release NotLogi is under the **PolyForm Noncommercial License 1.0.0**: free to use,
change and share for personal use, study, hobby projects and noncommercial organizations.
Commercial use needs a separate license; get in touch through [github.com/aabdelghani](https://github.com/aabdelghani). Releases up to
0.8.2 stay under MIT.

## [0.8.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.2) - 2026-10-05

### Fix
- A bare "Gestures & action ring" page could open for a device with no holdable buttons, showing an
  empty Button list. That page now only exists as a mouse button's Configure action ring or
  Configure gestures view; reached any other way, the device's own page opens (Keys for a keyboard,
  Buttons for a mouse).

Everything else is as in [0.8.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.1) and
[0.8.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.0).

## [0.8.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.1) - 2026-10-05

### Action ring
- **New folder** and **Next ring profile** are coming soon: they now sit at the bottom of the ring's
  action list, greyed out with a Soon tag. A Next ring profile slot already on your ring keeps working.

Everything else is as in [0.8.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.0):
Bluetooth pairing like Windows, steadier per-app profiles, the Bluetooth scrolling fix, and the
new name, NotLogi.

## [0.8.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.8.0) - 2026-10-05

LogiMX is now **NotLogi**: unofficial mouse & keyboard tools for Linux. The repository moved to
`aabdelghani/notlogi` (old links redirect). Commands, the background service, the Linux package name
and your settings stay as they were, so updating keeps everything.

### Bluetooth pairing, like Windows
- Put an MX mouse or keyboard in pairing mode (hold its Easy-Switch button for 3 seconds) and a
  pop-up offers to connect it.
- The pop-up takes the keyboard, since the mouse being paired may be the only one: **Tab** moves
  between Connect, Not now and Don't show again, **Enter** chooses, **Esc** closes. A keyboard's
  passkey is shown in large digits; it closes by itself once connected.
- Add device, then Bluetooth, now searches inside the app and connects with one click.
- The scan is Bluetooth Low Energy only and filtered to devices in pairing mode, in short bursts.
  Settings, "Notice Bluetooth devices in pairing mode", turns it off.

### Application profiles
- An app's own dialogs and pop-ups keep its profile (LibreOffice's dialogs no longer drop Back/Forward
  back to the global settings), and so does a moment with nothing in front.
- Opening NotLogi to look at the settings keeps the profile of the app you came from.
- A green dot on the application bar marks the profile in use right now.
- The application bar stays with the middle of the view when a panel opens.

### Fixes
- Scrolling over Bluetooth is no longer many times slower than over the Bolt receiver: while Linux's
  own Logitech driver handles the mouse, smooth scrolling stays on.

### Note for 0.7.0 users
The in-app update check in 0.7.0 does not follow the repository's new address, so it will not
announce this release. From 0.8.0 on it does.

## [0.7.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.7.0) - 2026-10-04

### Windows and macOS (beta)
- Windows 10 and 11: `LogiMX-Setup-0.7.0.exe`, a setup wizard with license, install location and options.
- macOS 11 or newer: `LogiMX-0.7.0-arm64.dmg` (Apple silicon) and `LogiMX-0.7.0-x64.dmg` (Intel).
- Flow: share the mouse, keyboard and clipboard with other computers (via Deskflow).

### Action ring
- Per-app rings: pick an application in the profile bar and give it its own ring.
- Ring size: Small, Medium or Large.
- Folders: a slot that opens eight more actions.
- Volume and screen Brightness: hold and drag to set (only the level bar stays on screen), or scroll over the slot with the ring open.
- Brightness follows the screen under the pointer: laptop backlight, or external monitors over DDC/CI. A one-click setup in the app installs what is missing (ddcutil and monitor access).
- Next ring profile and Easy-Switch to your other computers, right from the ring.

### Device view
- Mouse: Buttons, Point & scroll, Easy-Switch (on the underside photo, with each computer's name), Flow and Settings.
- Profile bar per device: add applications with their icons, several at once.
- A device that is not connected still opens and keeps your changes; it says Not connected.
- Larger text, refreshed layout, checked in all four themes.

### Make a wish
- Have a wish or found a problem? Make a wish or Report an issue from the home screen or the menu. Wishes are granted within 24 hours.

### Fixes
- The backlight overlay no longer shows "level 13 of 0" when a charger is connected.
- "Pause diversion" is now "Pause custom buttons".

## [0.6.23](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.23) - 2026-10-01

- Ring re-centres if Wayland shifts its window after opening
- Action ring page in the panel layout, app profiles inherit the default
- UI rework: Options+-style key and button panels, device paging, offline cards

## [0.6.22](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.22) - 2026-10-01

- Window opens wider (1380px)

## [0.6.21](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.21) - 2026-10-01

- Keys page: the keyboard is centred on the device's page list

## [0.6.20](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.20) - 2026-10-01

- Device view: the page starts level with the first item of the list (the keyboard with KEYS)

## [0.6.19](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.19) - 2026-10-01

- Device page list slides in as one

## [0.6.18](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.18) - 2026-10-01

- Keyboard fades in

## [0.6.17](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.17) - 2026-10-01

- Device view: one background, page list in capitals centred in its column, device name as large as the greeting beside the back arrow

## [0.6.16](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.16) - 2026-10-01

- Keys page: keyboard centred and larger

## [0.6.15](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.15) - 2026-10-01

- ADD DEVICE in capitals

## [0.6.14](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.14) - 2026-10-01

- Window buttons are plain icons, with a background only on hover

## [0.6.13](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.13) - 2026-10-01

- Home: greeting in the top row beside Add device and larger

## [0.6.12](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.12) - 2026-10-01

- Device view: its pages down the left (first one open) with Settings at the foot

## [0.6.11](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.11) - 2026-10-01

- Home: the percentage takes the battery icon's colour

## [0.6.10](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.10) - 2026-10-01

- MX Keys S photo from the same render set as the other devices, with its key positions

## [0.6.9](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.9) - 2026-10-01

- Home: percentage left of the battery icon, no label while simply on battery

## [0.6.8](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.8) - 2026-10-01

- Home: battery icon with its percentage beside it instead of the ring

## [0.6.7](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.7) - 2026-10-01

- Home: greeting back at the left, devices centred in the page and 30% larger with their text

## [0.6.6](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.6) - 2026-10-01

- Home: devices centred, each shown by its photo, battery and state, with a Bluetooth badge when that is the link

## [0.6.5](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.5) - 2026-10-01

- Home: top view of the mice, no boxes around the devices, just the greeting above them

## [0.6.4](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.4) - 2026-10-01

- Home: plain device photos, no shortcuts or focused-app line, agent status at the bottom edge

## [0.6.3](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.3) - 2026-10-01

- Home has one Add device, in the title bar

## [0.6.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.2) - 2026-10-01

- Title bar blends into the window

## [0.6.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.1) - 2026-10-01

- Landing page instead of a sidebar

## [0.6.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.6.0) - 2026-10-01

- Home page: every device with its battery, charging state, link and profile

## [0.5.4](https://github.com/aabdelghani/notlogi/releases/tag/v0.5.4) - 2026-09-30

- Problem report says how the ring found the pointer

## [0.5.3](https://github.com/aabdelghani/notlogi/releases/tag/v0.5.3) - 2026-09-30

- Motion across the app, and a ring that no longer makes the screen twitch
- Screenshots for 0.5.2, with the report dialog

## [0.5.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.5.2) - 2026-09-30

- Ring opens at the pointer on Wayland

## [0.5.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.5.1) - 2026-09-29

- Report a problem opens a filled-in issue

## [0.5.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.5.0) - 2026-09-29

- MX Master 4: haptic panel, haptic feedback, press force, ratchet force, its own photo

## [0.4.18](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.18) - 2026-09-29

- Packaged app ships the ring's bridge

## [0.4.17](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.17) - 2026-09-29

- Overlays stay out of the dock and the taskbar

## [0.4.16](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.16) - 2026-09-29

- Ring profiles, and an option to keep the pointer visible and free

## [0.4.15](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.15) - 2026-09-29

- Ring shows a label only for the action it is on
- Screenshots for 0.4.14, with the action ring

## [0.4.14](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.14) - 2026-09-29

- Ring waits for three times the travel before it picks, and the travel is a setting

## [0.4.13](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.13) - 2026-09-29

- Gestures page is called Gestures & action ring

## [0.4.12](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.12) - 2026-09-29

- Action ring moves under Gestures and dresses like the desktop

## [0.4.11](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.11) - 2026-09-29

- Ring redrawn as round buttons with their labels outside

## [0.4.10](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.10) - 2026-09-29

- Ring picks by direction: a nudge jumps straight to that wedge

## [0.4.9](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.9) - 2026-09-29

- Ring tracks the mouse one to one and shows only the highlight

## [0.4.8](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.8) - 2026-09-29

- Held ring takes the mouse: pointer hidden, movement steers a knob that stays in the ring

## [0.4.7](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.7) - 2026-09-29

- Ring on the gesture button keeps the pointer moving while held

## [0.4.6](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.6) - 2026-09-29

- Action ring: eight actions around the pointer on any button or key

## [0.4.5](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.5) - 2026-09-27

- F-key tiles show the assigned action's icon and the whole chord

## [0.4.4](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.4) - 2026-09-26

- MX Keys, MX Keys for Mac, for Business and the Mini models get their own photo, layout and defaults

## [0.4.3](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.3) - 2026-09-26

- Keys page follows the keyboard's own F-row layout instead of an MX Keys S table

## [0.4.2](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.2) - 2026-09-26

- Release workflow can create the release it attaches packages to
- A recorded chord can always be assigned, even when its release never arrives
- Battery warnings expire instead of staying on screen

## [0.4.1](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.1) - 2026-09-25

### Recording shortcuts other apps already own

Recording a shortcut that another application holds globally (Alt+Tab, Super, Ctrl+Alt+arrow, or anything registered by a tool like Kando) failed, because those keys were delivered to that application and never reached the window. The agent now grabs the keyboard while recording, which takes priority. Fixes #1.

The "Or type it" field under the recorder was inert and now assigns what you type, so any combination can also be entered by hand. That is the route on Wayland, where a keyboard grab is not possible.

### Battery notifications

- No more false low-battery warnings from a stale reading when a device wakes from sleep.
- Plugging in replaces the warning with a charging notice; at 100% you are told the charger can come out.
- Each notice carries a keyboard or mouse icon showing its state.

### UI

- The Thumb wheel tab is folded into Buttons; its Invert and Speed controls now sit under the button list.
- The app's own mark keeps its colour in every theme.

## [0.4.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.4.0) - 2026-09-09

The project is now **LogiMX**. Everything user-visible and on-disk moved with the name, and your existing configuration is migrated automatically on first run.

### Nothing needs a terminal any more

- The app starts the background agent itself, keeps it alive, and restarts it if it dies. It stays running when you close the window.
- On a fresh clone with nothing compiled, the app offers to build the agent for you and reports exactly what is missing if it cannot.
- The setup screen shows agent state with a button, instead of printing a command to copy.

### Actions

- **Apps tab** in the action picker, listing what is open right now under "Running now" and everything installed below, with search.
- **Steam games** are listed alongside desktop applications, read from the Steam library, and launch through the steam:// handler.
- **Built-in emoji picker** on the Emoji key: opens at the pointer, searchable, 1310 emoji, no network.
- **Reset to default** for a single control, and for a whole page.

### Fixes

- **Bolt pairing** now works when the device is also known to Bluetooth. The agent stays off the receiver's bus during the handshake, and `pair-bolt.sh` pairs with the adapter powered down.
- **F-row mode** on the MX Keys S is read and written on the connected host, so "use F1–F12 as standard keys" applies correctly.
- **Bluetooth-connected devices** enumerate properly, and a stale receiver link is dropped in favour of the one that answers.
- **No false low-battery warning.** The first reading after a device links is provisional and no longer triggers an alert.
- Startup no longer flashes "No devices found"; devices appear in about 0.2 s.

### Packaging

Both packages are built from a clean machine by the release workflow on every version tag.

## [0.3.0](https://github.com/aabdelghani/notlogi/releases/tag/v0.3.0) - 2026-09-05

- C++ agent: HID++ over hidraw, uinput actions, focus tracking (X11, GNOME, Sway), JSON RPC on a UNIX socket, Bolt pairing, battery history, config backups
- Electron UI: buttons, gestures editor, point and scroll, thumb wheel, keys with photo hotspots, backlight timers, Easy-Switch with host rename, per-application profiles, notifications and on-screen overlays, built-in emoji picker, tray status panel, first-run setup
- Supported: MX Master 3S and MX Keys S on a Bolt receiver (Bluetooth uses the same path, less tested)
- Python reference implementation of the agent, CLI client, udev rule, systemd user unit

See the README for build and install steps.
