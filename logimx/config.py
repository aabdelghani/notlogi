"""Configuration model: ~/.config/logimx/config.json

{
  "devices": {
    "b034": {                       # product id of the device (Bolt/Unifying WPID or BT PID)
      "settings": {...},            # device-wide hardware settings
      "profiles": {
        "default": {"buttons": {"195": "gesture_navigation", ...}, "thumbwheel": "hscroll", "keys": {...}},
        "firefox": {"match": ["firefox"], "buttons": {...}}
      }
    }
  }
}
"""
from __future__ import annotations

import json
import os
import threading
from copy import deepcopy

CONFIG_DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")), "logimx")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

# Control ids (0x1B04) used by the two reference devices
CID = {
    "left": 0x50, "right": 0x51, "middle": 0x52, "back": 0x53, "forward": 0x56,
    "gesture": 0xC3, "mode_shift": 0xC4,
    "calculator": 0x0A, "screen_lock": 0x6F, "brightness_down": 0xC7, "brightness_up": 0xC8,
    "backlight_down": 0xE2, "backlight_up": 0xE3, "prev_track": 0xE4, "play_pause": 0xE5, "next_track": 0xE6,
    "mute": 0xE7, "volume_down": 0xE8, "volume_up": 0xE9, "context_menu": 0xEA,
    "dictation": 0x103, "emoji": 0x108, "screenshot": 0x10A, "mic_mute": 0x11C,
    # the rest of the MX keyboard family (MX Keys, MX Keys Mini, Craft): the app lays the F row out
    # from the position each control reports, so it only needs a name and a label for them
    "mission_control": 0xE0, "launchpad": 0xE1, "show_desktop": 0x6E, "home_show_desktop": 0xFE, "app_switch": 0x109,
    "app_switch_dashboard": 0xFF, "search": 0xD4, "home": 0xD5, "virtual_keyboard": 0xD6, "screen_capture": 0xBF, "eject": 0x0D,
    "language_switch": 0xDD, "do_not_disturb": 0x11D, "open_apps": 0xCA, "all_apps": 0xCB, "switch_app": 0xCC,
    "right_arrow": 0xEB, "left_arrow": 0xEC,
    "haptic_panel": 0x1A0,
    "emoji_heart_eyes": 0x104, "emoji_crying": 0x105, "emoji_smiley": 0x106, "emoji_tears": 0x107,
    # Signature K650: browser keys on the F row, and Home, End, Page up and Page down above the arrows
    "browser_back": 0xCE, "refresh": 0x11F, "new_tab": 0xEE, "close_tab": 0x120, "settings": 0xA6, "print": 0x18,
    "home_key": 0x118, "end_key": 0x119, "page_up": 0x11A, "page_down": 0x11B,
}
CID_NAMES = {v: k for k, v in CID.items()}

CONTROL_LABELS = {
    0x50: "Left button", 0x51: "Right button", 0x52: "Middle button", 0x53: "Back button", 0x56: "Forward button",
    0xC3: "Gesture button", 0xC4: "Mode shift button", 0xD7: "Smart shift",
    0x0A: "Calculator", 0x6F: "Lock screen", 0xC7: "Brightness down", 0xC8: "Brightness up",
    0xE2: "Backlight down", 0xE3: "Backlight up", 0xE4: "Previous track", 0xE5: "Play / Pause", 0xE6: "Next track",
    0xE7: "Mute", 0xE8: "Volume down", 0xE9: "Volume up", 0xEA: "Context menu",
    0x103: "Dictation", 0x108: "Emoji", 0x10A: "Screen capture", 0x11C: "Mute microphone",
    0xEF: "Fn lock", 0x100: "Show desktop", 0x6E: "Show desktop", 0xA1: "Search", 0x11D: "Do not disturb",
    0xBF: "Screen capture", 0x0D: "Eject", 0xEB: "Right arrow (Fn)", 0xEC: "Left arrow (Fn)",
    0x1A0: "Haptic panel",
    0xE0: "Mission control / Task view", 0xE1: "Launchpad / Action center", 0xFE: "Show desktop", 0x109: "App switch / Launchpad",
    0xFF: "App switch / Dashboard", 0xD4: "Search", 0xD5: "Home / Mission control", 0xD6: "Virtual keyboard / Launchpad",
    0xDD: "Language switch", 0xCA: "Open apps", 0xCB: "All apps", 0xCC: "Switch app",
    0x104: "Emoji (heart eyes)", 0x105: "Emoji (crying)", 0x106: "Emoji (smiley)", 0x107: "Emoji (tears of joy)",
    0xD1: "Easy-Switch 1", 0xD2: "Easy-Switch 2", 0xD3: "Easy-Switch 3", 0xDE: "F lock",
    0xCE: "Back", 0x11F: "Refresh", 0xEE: "New tab", 0x120: "Close tab", 0xA6: "Settings", 0x18: "Print",
    0x118: "Home", 0x119: "End", 0x11A: "Page up", 0x11B: "Page down",
}

MX_MASTER_3S = {
    "settings": {
        "dpi": 1000,
        "smartshift": {"mode": "ratchet", "enabled": False, "threshold": 14},
        "hires": {"enabled": False, "invert": False},
        "thumbwheel": {"invert": False},
    },
    "profiles": {
        "default": {
            "name": "All applications",
            "buttons": {
                str(CID["middle"]): "native",
                str(CID["back"]): "native",
                str(CID["forward"]): "native",
                str(CID["gesture"]): "gesture_navigation",
                str(CID["mode_shift"]): "native",
            },
            "thumbwheel": "hscroll",
        }
    },
}

# MX Anywhere 3S: middle, back and forward, the SmartShift button behind the wheel; no thumb wheel
# and no gesture button (a button can be given gestures or the action ring)
MX_ANYWHERE_3S = {
    "settings": {
        "dpi": 1000,
        "smartshift": {"mode": "ratchet", "enabled": False, "threshold": 12},
        "hires": {"enabled": False, "invert": False},
    },
    "profiles": {
        "default": {
            "name": "All applications",
            "buttons": {
                str(CID["middle"]): "native",
                str(CID["back"]): "native",
                str(CID["forward"]): "native",
                str(CID["mode_shift"]): "native",
            },
            "thumbwheel": "native",
        }
    },
}

# MX Master 4: the 3S plus a haptic panel under the thumb, which opens the action ring, and
# haptic feedback for the ring and for gestures
MX_MASTER_4 = {
    "settings": dict(MX_MASTER_3S["settings"], haptic={"enabled": True, "ring": True, "gestures": True}),
    "profiles": {"default": dict(MX_MASTER_3S["profiles"]["default"],
                                 buttons=dict(MX_MASTER_3S["profiles"]["default"]["buttons"], **{str(0x1A0): "action_ring"}))},
}

MX_KEYS_S = {
    "settings": {
        "backlight": {"enabled": True, "mode": "auto", "level": 0},
        "fn_swap": True,
    },
    "profiles": {
        "default": {
            "name": "All applications",
            "keys": {
                str(CID["calculator"]): "native",
                str(CID["screen_lock"]): "native",
                str(CID["brightness_down"]): "native",
                str(CID["brightness_up"]): "native",
                str(CID["backlight_down"]): "native",
                str(CID["backlight_up"]): "native",
                str(CID["prev_track"]): "native",
                str(CID["play_pause"]): "native",
                str(CID["next_track"]): "native",
                str(CID["mute"]): "native",
                str(CID["volume_down"]): "native",
                str(CID["volume_up"]): "native",
                str(CID["context_menu"]): "native",
                str(CID["dictation"]): "nothing",
                str(CID["emoji"]): "emoji_picker",
                str(CID["screenshot"]): "screenshot_area",
                str(CID["mic_mute"]): "mic_mute",
            },
        }
    },
}

def _keyboard(keys, backlight=True, **overrides):
    """Keyboard defaults: backlight on automatic (for a keyboard that has one), F row sending its
    printed functions, every listed control left to the device unless an override names one of our presets."""
    settings = {"backlight": {"enabled": True, "mode": "auto", "level": 0}, "fn_swap": True} if backlight else {"fn_swap": True}
    return {
        "settings": settings,
        "profiles": {"default": {"name": "All applications",
                                 "keys": {str(CID[k]): overrides.get(k, "native") for k in keys}}},
    }

_MX_KEYS_ROW = ["brightness_down", "brightness_up", "mission_control", "launchpad", "show_desktop", "backlight_down", "backlight_up",
                "prev_track", "play_pause", "next_track", "mute", "volume_down", "volume_up", "calculator", "screen_capture", "context_menu", "screen_lock"]
MX_KEYS = _keyboard(_MX_KEYS_ROW)
MX_KEYS_MAC = _keyboard([k if k != "show_desktop" else "eject" for k in _MX_KEYS_ROW])
_MINI_ROW = ["backlight_down", "backlight_up", "dictation", "emoji", "screenshot", "mic_mute", "play_pause", "mute", "volume_down", "volume_up"]
_S_STYLE = {"dictation": "nothing", "emoji": "emoji_picker", "screenshot": "screenshot_area", "mic_mute": "mic_mute"}
MX_KEYS_MINI = _keyboard(_MINI_ROW, **_S_STYLE)
MX_KEYS_MINI_MAC = _keyboard(_MINI_ROW + ["do_not_disturb"], **_S_STYLE)
# Signature K650: no backlight, the S's F row keys plus browser keys, and a number pad
SIGNATURE_K650 = _keyboard(["brightness_down", "brightness_up", "mission_control", "app_switch", "dictation", "emoji", "screenshot",
                            "mic_mute", "browser_back", "refresh", "new_tab", "close_tab", "settings", "print", "calculator",
                            "show_desktop", "search", "screen_lock", "prev_track", "play_pause", "next_track", "mute",
                            "volume_down", "volume_up", "language_switch", "home_key", "end_key", "page_up", "page_down"],
                           backlight=False, **_S_STYLE)

PRO_X3_SUPERSTRIKE = {
    "settings": {
        "dpi": 800,
        "dpi_slots": {"0": 800, "1": 1200, "2": 1600, "3": 2400, "4": 3200},
        "dpi_enabled": {"0": True, "1": True, "2": True, "3": True, "4": True},
        "dpi_active": 0,
        "report_rate": 1000, "report_rate_wired": 1000,
        "hits": {"actuation": 5, "rapid_trigger_on": False, "rapid_trigger": 2, "haptics": 3},
    },
    "profiles": {
        "default": {
            "name": "All applications",
            "buttons": {
                str(CID["left"]): "native",
                str(CID["right"]): "native",
                str(CID["middle"]): "native",
                str(CID["back"]): "native",
                str(CID["forward"]): "native",
            },
            "thumbwheel": "native",
        }
    },
}

DEFAULTS_BY_PID = {
    0x40BE: PRO_X3_SUPERSTRIKE,                                         # PRO X3 SUPERSTRIKE (LIGHTSPEED)
    0xB034: MX_MASTER_3S, 0xB035: MX_MASTER_3S, 0xB043: MX_MASTER_3S,   # MX Master 3S (Bolt / business / BT)
    0xB042: MX_MASTER_4, 0xB048: MX_MASTER_4,                           # MX Master 4 / for Business
    0xB037: MX_ANYWHERE_3S,                                             # MX Anywhere 3S (Bolt and Bluetooth)
    0xB378: MX_KEYS_S, 0xB379: MX_KEYS_S, 0xB37A: MX_KEYS_S,            # MX Keys S (Bolt / business / mac)
    0xB35B: MX_KEYS, 0x408A: MX_KEYS,                                   # MX Keys (Bluetooth / Unifying)
    0xB361: MX_KEYS_MAC, 0x4092: MX_KEYS_MAC,                           # MX Keys for Mac
    0xB363: MX_KEYS_S,                                                  # MX Keys for Business (same keys as the S)
    0xB369: MX_KEYS_MINI, 0xB36E: MX_KEYS_MINI, 0xB36A: MX_KEYS_MINI_MAC,   # MX Keys Mini / for Business / for Mac
    0xB36F: SIGNATURE_K650, 0xB370: SIGNATURE_K650,                     # Signature K650 / for Business
}

GENERIC_MOUSE = {"settings": {}, "profiles": {"default": {"name": "All applications", "buttons": {}, "thumbwheel": "native"}}}
GENERIC_KEYBOARD = {"settings": {}, "profiles": {"default": {"name": "All applications", "keys": {}}}}


class Config:
    def __init__(self, path: str = CONFIG_PATH):
        self.path = path
        self.data = {"devices": {}, "general": {"desktop": "gnome"}}
        self._lock = threading.RLock()
        self.load()

    def load(self):
        with self._lock:
            try:
                with open(self.path) as f:
                    self.data = json.load(f)
            except (OSError, ValueError):
                pass
            self.data.setdefault("devices", {})
            self.data.setdefault("general", {"desktop": "gnome"})

    def save(self):
        with self._lock:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            tmp = self.path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(self.data, f, indent=2)
            os.replace(tmp, self.path)

    def device(self, pid: int, kind: str = "mouse") -> dict:
        """Return (creating from defaults if needed) the config block for a product id."""
        key = f"{pid:04x}"
        with self._lock:
            if key not in self.data["devices"]:
                base = DEFAULTS_BY_PID.get(pid) or (GENERIC_KEYBOARD if kind == "keyboard" else GENERIC_MOUSE)
                self.data["devices"][key] = deepcopy(base)
                self.save()
            return self.data["devices"][key]

    def set_setting(self, pid: int, path: list[str], value):
        with self._lock:
            d = self.device(pid).setdefault("settings", {})
            for p in path[:-1]:
                d = d.setdefault(p, {})
            d[path[-1]] = value
            self.save()

    def set_assignment(self, pid: int, profile: str, section: str, control: str, action):
        with self._lock:
            prof = self.device(pid).setdefault("profiles", {}).setdefault(profile, {"name": profile})
            if section == "thumbwheel":
                prof["thumbwheel"] = action
            else:
                prof.setdefault(section, {})[str(control)] = action
            self.save()

    def profile_for(self, pid: int, app_class: str | None) -> tuple[str, dict]:
        """Pick the profile whose `match` list contains the focused application."""
        dev = self.device(pid)
        profiles = dev.get("profiles", {})
        if app_class:
            lc = app_class.lower()
            for name, p in profiles.items():
                if name == "default":
                    continue
                for m in p.get("match", []):
                    if m.lower() in lc:
                        return name, p
        return "default", profiles.get("default", {})
