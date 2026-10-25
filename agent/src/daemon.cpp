#include "daemon.h"
#include "apps/tracker.h"
#include "apps/recorder.h"
#include "tables.gen.h"
#include "platform/platform.h"

#ifdef __linux__
#include <poll.h>
#include <sys/inotify.h>
#include <unistd.h>
#endif

// Linux's own Logitech driver (logitech-hidpp-device) handles a device connected directly, over
// Bluetooth for one, and on systems where the receiver is left to logitech-djreceiver. It turns the
// wheel's high-resolution mode on and divides every report by the multiplier (15 on the MX Master 3S). Turning
// the mode off underneath it leaves one report per notch divided by that: scrolling many times slower.
// So while that driver has the device, high-resolution scrolling stays on.
static bool kernelScalesWheel(const std::string& id) {
#ifdef __linux__
    std::string want = ":046D:" + id;
    for (auto& c : want) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
    std::error_code ec;
    std::filesystem::directory_iterator it("/sys/bus/hid/drivers/logitech-hidpp-device", ec), end;
    for (; !ec && it != end; it.increment(ec)) {
        std::string n = it->path().filename().string();   // e.g. 0005:046D:B034.001C
        if (n.find(want + ".") != std::string::npos) return true;
    }
#else
    (void)id;
#endif
    return false;
}

#include <cstring>
#include <cmath>
#include <cstdarg>
#include <deque>
#include <fstream>
#include <sstream>

#include <chrono>
#include <cstdio>
#include <ctime>
#include <thread>

using namespace std::chrono_literals;

static int gVerbose = 0;
void setVerbose(int v) { gVerbose = v; }

static std::mutex gLogMutex;
static std::deque<std::string> gLogRing;
static void logLine(const char* level, const char* fmt, ...) {
    std::time_t t = std::time(nullptr);
    char b[16];
    std::strftime(b, sizeof(b), "%H:%M:%S", std::localtime(&t));
    char msg[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);
    fprintf(stderr, "%s %s %s\n", b, level, msg);
    std::lock_guard<std::mutex> lk(gLogMutex);
    gLogRing.push_back(std::string(b) + " " + level + (strlen(level) == 4 ? "  " : " ") + msg);
    if (gLogRing.size() > 300) gLogRing.pop_front();
}
#define LOG(level, ...) logLine(level, __VA_ARGS__)
static void recordBattery(const std::string& id, int percent, bool charging);
static json batteryHistory(const std::string& id);
#define INFO(...) LOG("INFO", __VA_ARGS__)
#define WARN(...) LOG("WARN", __VA_ARGS__)
#define DEBUG(...) do { if (gVerbose) LOG("DEBUG", __VA_ARGS__); } while (0)

// ------------------------------------------------------------------ ManagedDevice

ManagedDevice::ManagedDevice(Daemon& d, hidpp::Transport& t, std::unique_ptr<hidpp::Device> dev, uint16_t pid, std::string serial)
    : daemon_(d), t_(t), dev_(std::move(dev)), pid_(pid), serial_(std::move(serial)) {
    kind_ = dev_->kind();
    cfg_ = daemon_.config().device(pid_, kind_);
    profile_ = cfg_["profiles"].value("default", json::object());
    actions::DeviceOps ops;
    ops.changeHost = [this](int h) { try { dev_->changeHost(h); } catch (...) {} };
    ops.getDpi = [this]() { try { auto d = dev_->dpi(); return d ? d->dpi : 0; } catch (...) { return 0; } };
    ops.setDpi = [this](int v) { try { dev_->setDpi(v); } catch (...) {} };
    ops.toggleSmartshift = [this]() {
        try {
            auto ss = dev_->smartshift();
            if (!ss) return;
            int mode = ss->mode == 2 ? 1 : 2;
            dev_->setSmartshift(mode, 0);
            daemon_.config().setSetting(pid_, {"smartshift", "mode"}, mode == 2 ? "ratchet" : "freespin");
            refreshConfig();
            readState();
            daemon_.broadcast("device", summary());
        } catch (...) {}
    };
    ops.changeHost = [this](int h) { daemon_.changeHostFrom(*this, h); };
    ops.uiEvent = [this](const std::string& k) { daemon_.broadcast("action", {{"id", id()}, {"kind", k}, {"device", dev_->name()}}); };
    ops.gestureFired = [this]() { cue("gesture"); };
    ops.ringEvent = [this](const std::string& k, int cid, int dx, int dy) {
        if (k == "move") { daemon_.broadcast("ring_move", {{"dx", dx}, {"dy", dy}}); return; }
        // raw says whether this control hands its movement to the ring (pointer frozen) or the
        // pointer keeps moving and the ring follows it
        daemon_.broadcast("action", {{"id", id()}, {"kind", k == "open" ? "ring" : "ring_release"}, {"device", dev_->name()}, {"raw", rawDiverted_.count(cid) > 0}});
    };
    engine_ = std::make_unique<actions::Engine>(daemon_.injector(), ops);
}

void ManagedDevice::refreshConfig() {
    cfg_ = daemon_.config().device(pid_, kind_);
    auto& profs = cfg_["profiles"];
    // an application's profile only holds what it changes: everything else comes from the default one
    profile_ = profs.value("default", json::object());
    if (profileName_ != "default" && profs.contains(profileName_)) {
        const json& p = profs[profileName_];
        for (auto& [k, v] : p.items()) {
            if (v.is_null()) continue;
            if ((k == "buttons" || k == "keys") && v.is_object() && profile_.contains(k) && profile_[k].is_object()) profile_[k].update(v);
            else profile_[k] = v;
        }
    }
}

// "bolt", "unifying", "lightspeed" after the receiver, "bluetooth", or "usb" (a cable)
std::string ManagedDevice::transportName() const {
    auto it = hidpp::kReceivers.find(t_.info().product);
    std::string k = it == hidpp::kReceivers.end() ? "" : it->second;
    if (k.empty()) return t_.info().bustype == 0x05 ? "bluetooth" : "usb";   // usb: a mouse on its own cable
    for (auto& c : k) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
    return k;
}

json ManagedDevice::batteryJson() const {
    if (!battery_) return json();
    json j = battery_->toJson();
    j["confirmed"] = batteryConfirmed_;
    return j;
}

json ManagedDevice::summary() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json controls = json::array();
    const json& labels = controlLabels();
    const json& names = cidNames();
    for (auto& [cid, c] : dev_->controls()) {
        std::string k = std::to_string(cid);
        char hx[16];
        snprintf(hx, sizeof(hx), "Control 0x%X", cid);
        controls.push_back({{"cid", cid}, {"name", names.value(k, "cid_" + k)}, {"label", labels.value(k, hx)},
                            {"divertable", c.divertable()}, {"raw_xy", c.rawXY()}, {"fkey", c.isFKey()}, {"position", c.position},
                            {"diverted", diverted_.count(cid) > 0}});
    }
    json feats = json::array();
    for (auto& [id, f] : dev_->features()) {
        char b[8];
        snprintf(b, sizeof(b), "%04X", id);
        feats.push_back(b);
    }
    return {{"id", id()}, {"pid", pid_}, {"name", dev_->name()}, {"friendly_name", dev_->friendlyName()},
        {"kind", kind_}, {"firmware", dev_->firmware()}, {"serial", dev_->serial().empty() ? serial_ : dev_->serial()},
        {"transport", transportName()},
        {"index", dev_->index()}, {"online", online_.load()}, {"battery", batteryJson()},
        {"profile", profileName_}, {"features", feats}, {"controls", controls}, {"state", state_},
        {"config", cfg_}};
}

json ManagedDevice::readState(bool full) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json st = json::object();
    try {
        battery_ = dev_->battery();
        batteryConfirmed_ = false;   // confirmed by the re-read a few seconds from now
        if (auto ss = dev_->smartshift())
            st["smartshift"] = {{"mode", ss->mode == 2 ? "ratchet" : "freespin"}, {"enabled", ss->threshold != 255}, {"threshold", ss->threshold}, {"default_threshold", ss->defaultThreshold},
                                {"tunable_torque", ss->tunable}, {"torque", ss->torque}, {"default_torque", ss->defaultTorque}};
        if (auto hp = dev_->haptic()) {
            json waves = json::array();
            for (int i = 0; i < 32; ++i) if (hp->waveforms & (1u << i)) waves.push_back(i);
            st["haptic"] = {{"enabled", hp->enabled}, {"level", hp->level}, {"discrete_levels", hp->discrete}, {"waveforms", waves}};
        }
        {
            json fb = json::array();
            for (auto& f : dev_->forceButtons())
                fb.push_back({{"index", f.index}, {"min", f.min}, {"max", f.max}, {"default", f.def}, {"current", f.current}, {"changeable", f.changeable}});
            if (!fb.empty()) st["force"] = fb;
        }
        if (auto hr = dev_->hires())
            st["hires"] = {{"hidpp_target", hr->hidppTarget}, {"hires", hr->hires}, {"invert", hr->invert}, {"multiplier", hr->multiplier},
                           {"has_invert", hr->hasInvert}, {"has_ratchet_switch", hr->hasRatchetSwitch}, {"kernel", kernelScalesWheel(id())}};
        if (auto tw = dev_->thumbwheel())
            st["thumbwheel"] = {{"diverted", tw->diverted}, {"invert", tw->invert}, {"native_res", tw->nativeRes}, {"diverted_res", tw->divertedRes}};
        if (auto dp = dev_->dpi())
            st["dpi"] = {{"dpi", dp->dpi}, {"default", dp->def}, {"levels", dp->levels}, {"stepped", dp->stepped}};
        if (auto xd = dev_->extendedDpi()) {
            // the slot in use is the one holding the sensor's DPI (the first such; -1 when a value off the list is set)
            int active = -1;
            for (size_t i = 0; i < xd->slots.size(); ++i)
                if (xd->slots[i] == xd->dpi) {
                    active = static_cast<int>(i);
                    break;
                }
            st["dpi"] = {{"dpi", xd->dpi}, {"default", xd->def}, {"levels", json::array({xd->min, xd->max, 50})}, {"stepped", true},
                {"slots", xd->slots}, {"lods", xd->lods}, {"lod", xd->lod}, {"active", active}, {"ranges", xd->ranges}};
        }
        if (auto rr = dev_->reportRate()) {
            auto list = [](int mask) { json a = json::array(); for (int i = 0; i < 7; ++i) if (mask & (1 << i)) a.push_back(std::atoi(hidpp::Device::reportRateName(i))); return a; };
            st["report_rate"] = {{"report_rate", rr->wireless >= 0 ? json(std::atoi(hidpp::Device::reportRateName(rr->wireless))) : json()},
                {"report_rate_wired", rr->wired >= 0 ? json(std::atoi(hidpp::Device::reportRateName(rr->wired))) : json()},
                {"wireless", list(rr->wirelessMask)}, {"wired", list(rr->wiredMask)}};
        }
        if (auto ac = dev_->analogCaps()) {
            json buttons = json::array();
            for (int b = 0; b < ac->buttons; ++b)
                if (auto ab = dev_->analogButton(b))
                    buttons.push_back({{"button", b}, {"actuation", ab->actuation}, {"rapid_trigger", ab->rapidTrigger}, {"rapid_trigger_on", ab->rapidTriggerOn}, {"haptics", ab->haptics}});
            st["hits"] = {{"max_actuation", ac->maxActuation}, {"max_rapid_trigger", ac->maxRapidTrigger}, {"max_haptics", ac->maxHaptics}, {"buttons", buttons}};
        }
        if (auto bh = dev_->bunnyHopTimeout()) {
            // 0 is off; 0xFF is what the mouse holds before any software set it, also off
            bool on = *bh > 0 && *bh < 0xFF;
            st["bunny_hop"] = {{"enabled", on}, {"timeout", on ? json(*bh * 10) : json()}};
        }
        if (auto om = dev_->onboardMode()) st["onboard_mode"] = *om;
        if (auto bl = dev_->backlight())
            st["backlight"] = {{"enabled", bl->enabled}, {"mode", bl->mode()}, {"level", bl->level}, {"num_levels", bl->numLevels},
                               {"current_level", bl->currentLevel}, {"status", bl->status}, {"auto_supported", bl->autoSupported()},
                               {"perm_manual_supported", bl->permManualSupported()}, {"duration_hands_out", bl->dho},
                               {"duration_hands_in", bl->dhi}, {"duration_powered", bl->dpow}};
        if (full || hostsCache_.is_null()) {
            auto [n, cur] = dev_->currentHost();
            json names = json::array();
            for (auto& h : dev_->hosts()) names.push_back({{"index", h.index}, {"paired", h.paired}, {"bus_type", h.busType}, {"name", h.name}});
            hostsCache_ = {{"count", n}, {"current", cur}, {"names", names}};
        }
        st["hosts"] = hostsCache_;
        if (auto fi = dev_->fnInversion()) st["fn_swap"] = *fi;
        if (auto dk = dev_->disableKeys()) st["disable_keys"] = {{"supported", dk->supported}, {"disabled", dk->disabled}};
        if (auto pf = dev_->platform()) st["platform"] = {{"platform", pf->platform}, {"source", pf->source}, {"auto", pf->autoPlatform}};
    } catch (const std::exception& e) {
        WARN("%s: readState: %s", dev_->name().c_str(), e.what());
    }
    state_ = st;
    return st;
}

// Which waveform goes with which cue follows the device's own pairing: a light tick when the
// ring moves onto an action, a soft thud when an action runs, a sharp tick for a gesture.
bool ManagedDevice::cue(const std::string& name) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    if (!dev_->has(hidpp::HAPTIC)) return false;
    const json h = cfg_.value("settings", json::object()).value("haptic", json::object());
    if (!h.value("enabled", true)) return false;
    int wave = -1;
    if (name == "ring_hover") { if (h.value("ring", true)) wave = 4; }
    else if (name == "ring_run") { if (h.value("ring", true)) wave = 1; }
    else if (name == "gesture") { if (h.value("gestures", true)) wave = 0; }
    if (wave < 0) return false;
    try { dev_->playHaptic(wave); } catch (...) { return false; }
    return true;
}

// battery saving: the backlight stays off while the keyboard runs on a battery at 20% or less
static bool backlightSaving(const json& cfg, const std::optional<hidpp::Battery>& b) {
    return cfg.value("settings", json::object()).value("backlight", json::object()).value("battery_saving", false) &&
           b && b->known && !b->charging && !b->externalPower && b->percent <= 20;
}

void ManagedDevice::applySettings(const std::string& only) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    // up to 0.10.0 the SmartShift switch set the wheel's mode itself (off was free-spin): such a
    // setting becomes a ratchet wheel, with SmartShift as that switch had it
    {
        json& raw = daemon_.config().device(pid_, kind_)["settings"];
        if (raw.contains("smartshift") && raw["smartshift"].is_object() && !raw["smartshift"].contains("enabled")) {
            raw["smartshift"]["enabled"] = raw["smartshift"].value("mode", "ratchet") == "ratchet";
            raw["smartshift"]["mode"] = "ratchet";
            daemon_.config().save();
            refreshConfig();
        }
    }
    const json& s = cfg_.value("settings", json::object());
    auto want = [&](const char* k) { return s.contains(k) && (only.empty() || only == k); };
    try {
        // a gaming mouse runs its own onboard profile until a host takes over; the settings below
        // only apply in host mode (G HUB does the same while it runs)
        if (dev_->has(hidpp::ONBOARD_PROFILES) && only.empty()) {
            auto m = dev_->onboardMode();
            if (m && *m != 2) {
                dev_->setOnboardMode(2);
                INFO("%s: onboard profiles -> host mode", dev_->name().c_str());
            }
        }
        // a gaming mouse: the DPI slot in use is what the sensor gets, and "dpi" keeps that value too
        if (s.contains("dpi_slots") && s["dpi_slots"].is_object() && (want("dpi_slots") || want("dpi_active"))) {
            const std::string slot = std::to_string(s.value("dpi_active", 1));
            if (s["dpi_slots"].contains(slot) && s["dpi_slots"][slot].is_number()) {
                const int dpi = s["dpi_slots"][slot].get<int>();
                daemon_.config().setSetting(pid_, {"dpi"}, dpi);
                if (dev_->has(hidpp::ADJUSTABLE_DPI)) dev_->setDpi(dpi);
                else if (dev_->has(hidpp::EXTENDED_DPI)) dev_->setExtendedDpi(dpi);
            }
        }
        if (dev_->has(hidpp::ADJUSTABLE_DPI) && want("dpi")) dev_->setDpi(s["dpi"].get<int>());
        else if (dev_->has(hidpp::EXTENDED_DPI) && want("dpi") && !s.contains("dpi_slots")) dev_->setExtendedDpi(s["dpi"].get<int>());
        if (dev_->has(hidpp::EXTENDED_REPORT_RATE)) {
            // the rate as an index into 125..8000 Hz, only when the link offers it
            auto rr = dev_->reportRate();
            auto apply = [&](const char* key, bool wireless) {
                if (!want(key) || !s[key].is_number() || !rr) return;
                int hz = s[key].get<int>(), idx = -1;
                for (int i = 0; i < 7; ++i)
                    if (std::atoi(hidpp::Device::reportRateName(i)) == hz) idx = i;
                int mask = wireless ? rr->wirelessMask : rr->wiredMask, cur = wireless ? rr->wireless : rr->wired;
                if (idx < 0 || !(mask & (1 << idx))) {
                    WARN("%s: %s %d Hz is not offered on this link", dev_->name().c_str(), key, hz);
                    return;
                }
                if (idx != cur) dev_->setReportRate(idx);
            };
            // the mouse takes a rate for the link it is on (checked on the PRO X3 SUPERSTRIKE: a wired
            // rate sent over the receiver lands on the wireless link); the other one waits for its link
            if (transportName() == "usb") apply("report_rate_wired", false);
            else apply("report_rate", true);
        }
        if (dev_->has(hidpp::ANALOG_BUTTONS) && want("hits") && s["hits"].is_object()) {
            // the same three values for both inductive buttons, as G HUB's "All (L+R)" does
            const json& h = s["hits"];
            hidpp::AnalogButton b;
            b.actuation = h.value("actuation", 5);
            b.rapidTrigger = h.value("rapid_trigger", 2);
            b.rapidTriggerOn = h.value("rapid_trigger_on", false);
            b.haptics = h.value("haptics", 3);
            for (int btn = 0; btn < 2; ++btn) dev_->setAnalogButton(btn, b);
        }
        if (dev_->has(hidpp::BUNNY_HOPPING) && want("bunny_hop") && s["bunny_hop"].is_object()) {
            const json& b = s["bunny_hop"];
            dev_->setBunnyHopTimeout(b.value("enabled", false) ? b.value("timeout", 100) / 10 : 0);
        }
        if ((dev_->has(hidpp::SMART_SHIFT) || dev_->has(hidpp::SMART_SHIFT_ENHANCED)) && want("smartshift")) {
            // the wheel's mode (ratchet unless chosen otherwise) and SmartShift, which frees a ratchet
            // wheel when it is flicked faster than the threshold; off, the device never frees it (255)
            const json& ss = s["smartshift"];
            int mode = ss.value("mode", "ratchet") == "freespin" ? 1 : 2;
            int threshold = ss.value("enabled", false) ? std::max(1, std::min(254, ss.value("threshold", 12))) : 255;
            dev_->setSmartshift(mode, threshold, ss.value("torque", 0));
        }
        if (dev_->has(hidpp::HAPTIC) && want("haptic")) {
            const json& h = s["haptic"];
            int level = h.value("level", 0);
            if (level <= 0) { auto cur = dev_->haptic(); level = cur ? cur->level : 50; }
            dev_->setHaptic(h.value("enabled", true), level);
        }
        if (dev_->has(hidpp::FORCE_BUTTON) && want("panel_force") && s["panel_force"].is_number()) dev_->setForce(0, s["panel_force"].get<int>());
        if (dev_->has(hidpp::HIRES_WHEEL) && want("hires")) {
            const json& h = s["hires"];
            // a speed other than 1 or smooth scrolling: the wheel reports to the agent, which plays it
            // into the desktop itself; otherwise it goes straight to the system as before
            wheelSpeed_ = h.value("speed", 1.0);
            wheelSmooth_ = h.value("smooth", false);
            wheelInvert_ = h.value("invert", false);
            wheelTaken_ = wheelSmooth_ || std::abs(wheelSpeed_ - 1.0) > 0.01;
            // a wheel that can free-spin (SmartShift) keeps turning by itself after a flick: a coast
            // on top of it would scroll on after the wheel stops
            bool freeSpin = dev_->has(hidpp::SMART_SHIFT) || dev_->has(hidpp::SMART_SHIFT_ENHANCED);
            engine_->setMomentum(wheelSmooth_ && !freeSpin && h.value("momentum", true));
            if (wheelTaken_) {
                if (auto hr = dev_->hires()) wheelMult_ = std::max(1, hr->multiplier);
                dev_->setHires(true, true, false);
            } else {
                dev_->setHires(false, kernelScalesWheel(id()) || h.value("enabled", false), wheelInvert_);
            }
        }
        if (dev_->has(hidpp::BACKLIGHT2) && want("backlight")) {
            const json& b = s["backlight"];
            std::string m = b.value("mode", "auto");
            int mode = m == "manual" ? 3 : (m == "temporary" ? 2 : 1);
            auto opt = [&](const char* k) -> std::optional<int> { return b.contains(k) ? std::optional<int>(b[k].get<int>()) : std::nullopt; };
            dev_->setBacklight(b.value("enabled", true) && !backlightSaving(cfg_, battery_), mode, b.value("level", 0), opt("duration_hands_out"), opt("duration_hands_in"), opt("duration_powered"));
        }
        if (dev_->has(hidpp::FN_INVERSION_K375S) && want("fn_swap")) dev_->setFnInversion(s["fn_swap"].get<bool>());
        if (dev_->has(hidpp::DISABLE_KEYS) && want("disable_keys")) {
            static const std::pair<const char*, int> bits[] = {{"caps_lock", 0x01}, {"num_lock", 0x02}, {"scroll_lock", 0x04}, {"insert", 0x08}, {"win", 0x10}};
            int mask = 0;
            for (auto& [k, b] : bits) if (s["disable_keys"].value(k, false)) mask |= b;
            dev_->setDisabledKeys(mask);
        }
        // keep the layout: pin the one in use as set by software, so the keyboard stops switching
        // it on its own. The MX Keys S refuses to be put back to detecting (0xFF is an invalid
        // argument), so letting go sets what the keyboard itself would pick.
        if (dev_->has(hidpp::MULTIPLATFORM) && want("keep_layout")) {
            if (auto pf = dev_->platform()) {
                if (s["keep_layout"].get<bool>()) { if (pf->source < 2) dev_->setPlatform(pf->platform); }
                else if (pf->platform != pf->autoPlatform) dev_->setPlatform(pf->autoPlatform);
            }
        }
        if (kind_ == "mouse" && want("pointer_speed") && s["pointer_speed"].is_number()) applyPointerSpeed(s["pointer_speed"].get<double>());
    } catch (const std::exception& e) {
        WARN("%s: applySettings: %s", dev_->name().c_str(), e.what());
    }
}

// OS-side pointer speed (-1..1)
void ManagedDevice::applyPointerSpeed(double v) {
    if (v < -1) v = -1;
    if (v > 1) v = 1;
    platform::setPointerSpeed(v, dev_->name(), t_.info().name);
}

void ManagedDevice::applyAssignments() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    std::map<int, json> wanted;
    for (const char* section : {"buttons", "keys"}) {
        if (!profile_.contains(section)) continue;
        for (auto& [cidS, action] : profile_[section].items()) {
            int cid;
            try { cid = std::stoi(cidS); } catch (...) { continue; }
            json a = actions::resolve(action);
            if (a.is_object() && a.value("type", "native") != "native") wanted[cid] = a;
        }
    }
    if (!dev_->has(hidpp::SPECIAL_KEYS) && dev_->has(hidpp::MOUSE_BUTTON_SPY)) {
        // no 0x1B04: a button with an action of its own stops sending its HID button (remapped to
        // none) and the button spy reports every press; everything else keeps its own button
        try {
            if (spyMap_.empty()) spyMap_ = dev_->spyButtonMap();
            hidpp::Bytes map = spyMap_;
            std::set<int> now;
            for (auto& [cid, ctl] : dev_->controls()) {
                size_t i = ctl.position ? ctl.position - 1 : 0;
                if (i >= map.size()) continue;
                bool want = wanted.count(cid) > 0;
                map[i] = want ? 0 : static_cast<uint8_t>(i + 1);
                if (want) now.insert(cid);
            }
            if (map != spyMap_) {
                dev_->setSpyButtonMap(map);
                spyMap_ = map;
            }
            bool spyOn = !now.empty();
            if (spyOn != spying_) {
                dev_->spy(spyOn);
                spying_ = spyOn;
            }
            diverted_ = now;
        } catch (const std::exception& e) {
            WARN("%s: button spy: %s", dev_->name().c_str(), e.what());
        }
    }
    for (auto& [cid, ctl] : dev_->controls()) {
        if (!ctl.divertable() || !dev_->has(hidpp::SPECIAL_KEYS)) continue;
        bool want = wanted.count(cid) > 0;
        // gestures and the action ring both take the mouse's movement while the control is held
        // (the ring can be told to leave the pointer alone: general.ring.free_pointer)
        const json& general = daemon_.config().data()["general"];
        bool freeRing = general.is_object() && general.contains("ring") && general["ring"].is_object() && general["ring"].value("free_pointer", false);
        bool ringHere = wanted.count(cid) && wanted[cid].value("type", "") == "ui" && wanted[cid].value("event", "") == "ring";
        bool steers = want && (wanted[cid].value("type", "") == "gesture" || (ringHere && !freeRing));
        bool raw = steers && ctl.rawXY();
        bool isDiverted = diverted_.count(cid) > 0, isRaw = rawDiverted_.count(cid) > 0;
        // raw XY must be written whenever it changes, not only when the diversion does: a button
        // going from a gesture to another action stays diverted but has to give the pointer back
        if (want != isDiverted || raw != isRaw) {
            try {
                dev_->setReporting(cid, want, ctl.rawXY() ? std::optional<bool>(raw) : std::nullopt);
                if (want) diverted_.insert(cid);
                else diverted_.erase(cid);
                if (raw) rawDiverted_.insert(cid);
                else rawDiverted_.erase(cid);
            } catch (const std::exception& e) {
                WARN("%s: divert 0x%x: %s", dev_->name().c_str(), cid, e.what());
            }
        }
    }
    if (dev_->has(hidpp::THUMB_WHEEL)) {
        json tw = actions::resolve(profile_.value("thumbwheel", json("native")));
        const json ts = cfg_.value("settings", json::object()).value("thumbwheel", json::object());
        bool invert = ts.value("invert", false);
        thumbSpeed_ = ts.value("speed", 1.0);
        thumbSmooth_ = ts.value("smooth", false);
        thumbTuned_ = thumbSmooth_ || std::abs(thumbSpeed_ - 1.0) > 0.01;
        try {
            dev_->setThumbwheel(tw.value("type", "native") != "native" || thumbTuned_, invert);
        } catch (const std::exception& e) {
            WARN("%s: thumbwheel: %s", dev_->name().c_str(), e.what());
        }
    }
}

void ManagedDevice::releaseAll() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    if (!dev_->has(hidpp::SPECIAL_KEYS) && dev_->has(hidpp::MOUSE_BUTTON_SPY)) {
        try {
            hidpp::Bytes map;
            for (size_t i = 0; i < std::max<size_t>(spyMap_.size(), dev_->controls().size()); ++i) map.push_back(static_cast<uint8_t>(i + 1));
            if (!map.empty()) dev_->setSpyButtonMap(map);
            spyMap_ = map;
            if (spying_) dev_->spy(false);
            spying_ = false;
        } catch (...) {
        }
        diverted_.clear();
        rawDiverted_.clear();
        // the mouse's own profile again, as it ran before NotLogi took over
        if (dev_->has(hidpp::ONBOARD_PROFILES)) {
            try {
                dev_->setOnboardMode(1);
            } catch (...) {}
        }
        return;
    }
    for (int cid : diverted_) {
        try {
            auto it = dev_->controls().find(static_cast<uint16_t>(cid));
            bool raw = it != dev_->controls().end() && it->second.rawXY();
            dev_->setReporting(static_cast<uint16_t>(cid), false, raw ? std::optional<bool>(false) : std::nullopt);
        } catch (...) {
        }
    }
    diverted_.clear();
    rawDiverted_.clear();
    if (dev_->has(hidpp::THUMB_WHEEL)) {
        try { dev_->setThumbwheel(false, false); } catch (...) {}
    }
    // the wheel back to the system, as the settings have it
    if (wheelTaken_ && dev_->has(hidpp::HIRES_WHEEL)) {
        const json h = cfg_.value("settings", json::object()).value("hires", json::object());
        try { dev_->setHires(false, kernelScalesWheel(id()) || h.value("enabled", false), h.value("invert", false)); } catch (...) {}
        wheelTaken_ = false;
    }
}

bool ManagedDevice::hasAppProfile(const std::string& appClass) { return daemon_.config().profileFor(pid_, appClass).first != "default"; }

void ManagedDevice::setProfile(const std::string& appClass) {
    auto [name, prof] = daemon_.config().profileFor(pid_, appClass);
    if (name != profileName_) {
        profileName_ = name;
        (void)prof;
        refreshConfig();   // the app's changes laid over the default profile
        INFO("%s: profile -> %s (%s)", dev_->name().c_str(), name.c_str(), appClass.c_str());
        applyAssignments();
        daemon_.broadcast("profile", {{"id", id()}, {"profile", name}, {"app", appClass}});
    }
}

json ManagedDevice::actionFor(int cid) {
    std::string k = std::to_string(cid);
    for (const char* section : {"buttons", "keys"})
        if (profile_.contains(section) && profile_[section].contains(k)) return profile_[section][k];
    return "native";
}

void ManagedDevice::handle(const hidpp::Event& ev) {
    if (daemon_.paused()) return;
    if (ev.kind == "buttons") {
        std::set<int> now;
        for (auto& c : ev.data["down"]) now.insert(c.get<int>());
        for (int c : now)
            if (!down_.count(c)) {
                INFO("%s: control 0x%x pressed -> %s", dev_->name().c_str(), c, actions::resolve(actionFor(c)).value("label", actionFor(c).is_string() ? actionFor(c).get<std::string>() : "custom").c_str());
                engine_->buttonDown(c, actionFor(c));
            }
        for (int c : down_)
            if (!now.count(c)) {
                json a = actions::resolve(actionFor(c));
                engine_->buttonUp(c, actionFor(c));
                announce(a);
            }
        down_ = now;
    } else if (ev.kind == "raw_xy") {
        engine_->rawXY(ev.data["dx"].get<int>(), ev.data["dy"].get<int>());
    } else if (ev.kind == "thumbwheel") {
        // the wheel reports rotation towards the user as positive; normalise so forward (away) is positive,
        // which the engine maps to right / up / next
        // with its own speed or smooth scrolling, the thumb wheel left to the system scrolls sideways here
        json a = profile_.value("thumbwheel", json("native"));
        if (thumbTuned_ && actions::resolve(a).value("type", "native") == "native") a = "hscroll";
        engine_->thumbwheel(-ev.data["rotation"].get<int>(), a, thumbSpeed_, thumbSmooth_);
    } else if (ev.kind == "wheel") {
        if (!wheelTaken_) return;
        // hi-res steps (or whole notches) to 1/120 of a notch, positive = up
        double units = ev.data["delta"].get<int>() * 120.0 / (ev.data["hires"].get<bool>() ? wheelMult_ : 1);
        engine_->wheel(wheelInvert_ ? -units : units, wheelSpeed_, wheelSmooth_);
    } else if (ev.kind == "ratchet") {
        engine_->setRatchet(ev.data["ratchet"].get<bool>());
    } else if (ev.kind == "battery") {
        bool wasSaving = backlightSaving(cfg_, battery_);
        hidpp::Battery nb;
        nb.known = ev.data["percent"].is_number();
        nb.percent = nb.known ? ev.data["percent"].get<int>() : 0;
        nb.level = ev.data.value("level", "");
        nb.charging = ev.data.value("charging", false);
        nb.externalPower = ev.data.value("external_power", false);
        battery_ = nb;
        batteryConfirmed_ = true;
        if (backlightSaving(cfg_, battery_) != wasSaving) applySettings("backlight");
        daemon_.broadcast("battery", {{"id", id()}, {"battery", batteryJson()}});
    } else if (ev.kind == "wireless") {
        if (ev.data.value("reconnect", false)) {
            INFO("%s: reconnected, re-applying", dev_->name().c_str());
            auto self = shared_from_this();
            std::thread([self] { std::this_thread::sleep_for(150ms); self->reapply(); }).detach();
        }
    } else if (ev.kind == "fn_swap") {
        state_["fn_swap"] = ev.data["on"];
        INFO("%s: F-row now sends %s", dev_->name().c_str(), ev.data["on"].get<bool>() ? "special functions" : "F1-F12");
        daemon_.broadcast("device", summary());
    } else if (ev.kind == "backlight") {
        // the overlay is for a level the person changed; a status notice (hands near, charger
        // plugged in) repeats the level it already had and shows nothing
        bool changed = !state_.contains("backlight") || state_["backlight"].value("current_level", -1) != ev.data["level"].get<int>();
        if (state_.contains("backlight")) state_["backlight"]["current_level"] = ev.data["level"];
        daemon_.broadcast("backlight", {{"id", id()}, {"level", ev.data["level"]}});
        if (changed) daemon_.broadcast("action", {{"id", id()}, {"kind", "backlight"}, {"level", ev.data["level"]}, {"num_levels", ev.data.value("num_levels", 8)}, {"device", dev_->name()}});
    } else if (ev.kind == "backlight_config") {
        // read the new configuration back off this (reader) thread, which must stay free for the reply
        auto self = shared_from_this();
        std::thread([self] { try { self->readState(true); self->daemon_.broadcast("device", self->summary()); } catch (...) {} }).detach();
    }
}

// tell the UI what a control just did, so it can show an on-screen overlay
void ManagedDevice::announce(const json& a) {
    std::string t = a.value("type", "");
    std::string preset = a.value("preset", "");
    try {
        if (t == "smartshift_toggle") {
            auto ss = dev_->smartshift();
            if (ss) daemon_.broadcast("action", {{"id", id()}, {"kind", "smartshift"}, {"mode", ss->mode == 2 ? "ratchet" : "freespin"}, {"device", dev_->name()}});
        } else if (t == "dpi_cycle") {
            auto d = dev_->dpi();
            if (d) daemon_.broadcast("action", {{"id", id()}, {"kind", "dpi"}, {"dpi", d->dpi}, {"device", dev_->name()}});
        } else if (t == "change_host") {
            daemon_.broadcast("action", {{"id", id()}, {"kind", "host"}, {"host", a.value("host", 0)}, {"device", dev_->name()}});
        } else if (t == "keystroke") {
            for (auto& k : a.value("keys", json::array()))
                if (k == "KEY_MICMUTE") daemon_.broadcast("action", {{"id", id()}, {"kind", "mic"}, {"device", dev_->name()}});
        }
    } catch (...) {
    }
}

void ManagedDevice::reapply() {
    try {
        std::lock_guard<std::recursive_mutex> lk(m_);
        diverted_.clear();
        spyMap_.clear();
        spying_ = false;
        dev_->invalidateFnHost();
        applySettings();
        applyAssignments();
        readState();
        daemon_.broadcast("device", summary());
    } catch (const std::exception& e) {
        WARN("%s: reapply: %s", dev_->name().c_str(), e.what());
    } catch (...) {
        WARN("%s: reapply: unknown error", dev_->name().c_str());
    }
}

// ------------------------------------------------------------------------ Daemon

static Daemon* gDaemon = nullptr;

Daemon::Daemon() {
    injector_ = std::make_unique<actions::Injector>();
    server_ = std::make_unique<ipc::Server>([this](const std::string& m, const json& p) { return rpc(m, p); });
    tracker_ = std::make_unique<apps::Tracker>([this](const std::string& c) { onApp(c); });
    gDaemon = this;
}

Daemon::~Daemon() {
    server_.reset();
    for (auto& md : snapshot()) md->releaseAll();
    {
        std::lock_guard<std::mutex> lk(mapMutex_);
        devices_.clear();
    }
    transports_.clear();
    injector_.reset();
}

// Does the device still answer on its current link? A disconnected receiver slot replies with an
// HID++ error (0x04 on Bolt) instead of the protocol version.
bool Daemon::linkAlive(ManagedDevice& md) {
    try {
        hidpp::Bytes r = md.transport().request(md.dev().index(), 0x00, 0x1, {0, 0, 0x5a}, std::nullopt, false);
        return r.size() >= 2;
    } catch (const hidpp::HidppError& e) {
        return e.code == 0x01;   // HID++ 1.0 device: alive, just no feature 0x0000
    } catch (...) {
        return false;
    }
}


static json cachedApplications() {
    static json cache;
    static std::chrono::steady_clock::time_point at{};
    auto now = std::chrono::steady_clock::now();
    if (cache.is_null() || now - at > 60s) { cache = platform::listApplications(); at = now; }
    return cache;
}

Daemon::DevPtr Daemon::find(const std::string& id) {
    std::lock_guard<std::mutex> lk(mapMutex_);
    auto it = devices_.find(id);
    return it == devices_.end() ? nullptr : it->second;
}

std::vector<Daemon::DevPtr> Daemon::snapshot() {
    std::lock_guard<std::mutex> lk(mapMutex_);
    std::vector<DevPtr> out;
    for (auto& [id, md] : devices_) out.push_back(md);
    return out;
}

int Daemon::run() {
    tracker_->start();
    INFO("app tracker backend: %s", tracker_->backend().c_str());
    platform::onStop([] { if (gDaemon) gDaemon->stop(); });

    int ifd = -1;
#ifdef __linux__
    // hot plug: watch /dev for hidraw nodes appearing, disappearing or changing permissions
    ifd = inotify_init1(IN_NONBLOCK | IN_CLOEXEC);
    if (ifd >= 0 && inotify_add_watch(ifd, "/dev", IN_CREATE | IN_DELETE | IN_ATTRIB) < 0) {
        ::close(ifd);
        ifd = -1;
    }
#endif
    INFO("hot plug: %s", ifd >= 0 ? "inotify on /dev" : "polling");

    auto lastScan = std::chrono::steady_clock::time_point{};
    auto lastPoll = std::chrono::steady_clock::now();
    std::optional<std::chrono::steady_clock::time_point> scanAt;   // debounced scan request
    // without a hot-plug signal (macOS, Windows) look every second; while Flow is handing devices
    // over to this computer, every 150 ms
    const auto pollInterval = ifd >= 0 ? std::chrono::milliseconds(15000) : std::chrono::milliseconds(1000);
    const auto steadyMs = [] { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); };
    while (!stop_) {
        auto now = std::chrono::steady_clock::now();
#ifdef __linux__
        if (ifd >= 0) {
            pollfd p{ifd, POLLIN, 0};
            if (::poll(&p, 1, 0) > 0) {
                char buf[4096];
                ssize_t n;
                while ((n = ::read(ifd, buf, sizeof(buf))) > 0) {
                    for (ssize_t off = 0; off < n;) {
                        auto* ev = reinterpret_cast<inotify_event*>(buf + off);
                        if (ev->len && !strncmp(ev->name, "hidraw", 6)) {
                            DEBUG("hot plug: %s %s", (ev->mask & IN_DELETE) ? "removed" : "changed", ev->name);
                            scanAt = now + 600ms;  // wait for udev to finish applying permissions
                        }
                        off += sizeof(inotify_event) + ev->len;
                    }
                }
            }
        }
#endif
        const bool expecting = steadyMs() < expectUntil_.load();
        if ((scanAt && now >= *scanAt) || now - lastScan > (expecting ? std::chrono::milliseconds(150) : pollInterval)) {
            scan();
            lastScan = now;
            scanAt.reset();
        }
        if (now - lastPoll > 30s && !pairing_.load()) {
            for (auto& md : snapshot()) {
                try {
                    md->setBattery(md->dev().battery(), true);
                    if (auto b = md->battery()) { if (b->known) recordBattery(md->id(), b->percent, b->charging); broadcast("battery", {{"id", md->id()}, {"battery", md->batteryJson()}}); }
                } catch (...) {
                }
            }
            lastPoll = now;
        }
        std::this_thread::sleep_for(expecting ? 25ms : 100ms);
    }
#ifdef __linux__
    if (ifd >= 0) ::close(ifd);
#endif
    INFO("shutting down");
    return 0;
}

void Daemon::scan() {
    std::lock_guard<std::mutex> scanLock(scanMutex_);
    if (pairing_.load()) return;   // stay off the receiver's HID++ bus during a pairing handshake
    auto nodes = hidpp::usable(hidpp::scan());
    std::set<std::string> seen;
    for (auto& n : nodes) seen.insert(n.path);

    // 1. transports that vanished: take them out of the maps, destroy outside the lock
    std::vector<std::unique_ptr<hidpp::Transport>> dying;
    std::vector<DevPtr> dyingDevs;
    {
        std::lock_guard<std::mutex> lk(mapMutex_);
        for (auto it = transports_.begin(); it != transports_.end();) {
            if (seen.count(it->first)) { ++it; continue; }
            for (auto dit = devices_.begin(); dit != devices_.end();) {
                if (&dit->second->transport() == it->second.get()) {
                    INFO("device %s gone", dit->first.c_str());
                    dyingDevs.push_back(dit->second);
                    dit = devices_.erase(dit);
                } else {
                    ++dit;
                }
            }
            dying.push_back(std::move(it->second));
            it = transports_.erase(it);
        }
    }
    for (auto& md : dyingDevs) broadcast("device_removed", {{"id", md->id()}});
    dyingDevs.clear();
    dying.clear();

    // 2. known receivers: retry empty slots every few seconds (a device that re-links only
    //    on its first keypress or movement is otherwise picked up by the 0x41 notification)
    auto nowT = std::chrono::steady_clock::now();
    bool retry = nowT - lastRetry_ > 5s;
    if (retry) lastRetry_ = nowT;
    std::vector<std::pair<hidpp::Transport*, hidpp::Node>> direct;   // new devices on their own link
    for (auto& n : nodes) {
        hidpp::Transport* t = nullptr;
        {
            std::lock_guard<std::mutex> lk(mapMutex_);
            auto it = transports_.find(n.path);
            if (it != transports_.end()) t = it->second.get();
        }
        if (t) {
            if (n.isReceiver() && retry) {
                for (uint8_t i = 1; i <= 6; ++i) {
                    bool have = false;
                    for (auto& md : snapshot())
                        if (&md->transport() == t && md->dev().index() == i) have = true;
                    if (!have) attach(*t, i, n);
                }
            }
            continue;
        }
        // 3. new node
        std::unique_ptr<hidpp::Transport> nt;
        try {
            nt = std::make_unique<hidpp::Transport>(n.path, nullptr);
        } catch (const std::exception& e) {
            DEBUG("open %s: %s", n.path.c_str(), e.what());
            continue;
        }
        hidpp::Transport* tp = nt.get();
        tp->setCallback([this, tp](const hidpp::Notification& nn) { onNotification(*tp, nn); });
        {
            std::lock_guard<std::mutex> lk(mapMutex_);
            transports_[n.path] = std::move(nt);
        }
        int found = 0;
        if (n.isReceiver()) {
            for (uint8_t i = 1; i <= 6; ++i)
                if (attach(*tp, i, n)) ++found;
            INFO("receiver %s on %s: %d device(s)", n.receiverKind().c_str(), n.path.c_str(), found);
        } else {
            direct.push_back({tp, n});
        }
    }
    // devices on their own link (Bluetooth) are set up side by side: one does not wait for another
    std::vector<std::thread> setups;
    for (auto& [tp, n] : direct)
        setups.emplace_back([this, tp = tp, n = n] {
            if (attach(*tp, 0xFF, n)) return;
            std::unique_ptr<hidpp::Transport> drop;
            {
                std::lock_guard<std::mutex> lk(mapMutex_);
                drop = std::move(transports_[n.path]);
                transports_.erase(n.path);
            }
        });
    for (auto& th : setups) th.join();
}

bool Daemon::attach(hidpp::Transport& t, uint8_t idx, const hidpp::Node& node) {
    // one setup at a time per link (a receiver's slots share it); different links go side by side
    std::mutex* linkLock;
    {
        std::lock_guard<std::mutex> lk(attachMutex_);
        linkLock = &attachLocks_[&t];
    }
    std::lock_guard<std::mutex> lk(*linkLock);
    for (auto& md : snapshot())
        if (&md->transport() == &t && md->dev().index() == idx) return false;
    auto dev = std::make_unique<hidpp::Device>(t, idx);
    try {
        if (!dev->enumerate()) { DEBUG("enumerate %s/%d: no HID++ 2.0 answer", t.path().c_str(), idx); return false; }
    } catch (const std::exception& e) {
        DEBUG("enumerate %s/%d: %s", t.path().c_str(), idx, e.what());
        return false;
    }
    uint16_t pid = node.product;
    std::string serial;
    if (node.isReceiver()) {
        auto pi = t.pairingInfo(idx);
        if (pi) {
            pid = pi->wpid;
            serial = pi->serial;
        } else if (auto di = dev->deviceInfo()) {
            // LIGHTSPEED receivers answer neither pairing register: the device says who it is
            INFO("%s/%d: pairing info unavailable, using the device's own model id %04X", t.path().c_str(), idx, di->first);
            pid = di->first;
            serial = di->second;
        } else {
            DEBUG("%s/%d: no pairing info and no device info", t.path().c_str(), idx);
            return false;
        }
    }
    if (pid == 0) return false;
    std::string key = Config::key(pid);
    if (auto existing = find(key)) {
        if (&existing->transport() == &t) return false;
        // the same device on another transport (Bolt vs Bluetooth): keep whichever link still answers
        if (linkAlive(*existing)) return false;
        INFO("%s: reachable via %s now, dropping the stale link on %s", existing->dev().name().c_str(), t.path().c_str(), existing->transport().path().c_str());
        {
            std::lock_guard<std::mutex> lk(mapMutex_);
            devices_.erase(key);
        }
        broadcast("device_removed", {{"id", key}});
    }
    auto md = std::make_shared<ManagedDevice>(*this, t, std::move(dev), pid, serial);
    INFO("device %s (%s) pid %04x via %s idx %d, %zu features, %zu controls", md->dev().name().c_str(), md->dev().kind().c_str(),
         pid, t.path().c_str(), idx, md->dev().features().size(), md->dev().controls().size());
    // what the hand feels first (diverted buttons, gestures, the ring), then announce the device so
    // the window and Flow can use it, then the rest of its settings and state
    md->setProfile(appClass_);
    md->applyAssignments();
    {
        std::lock_guard<std::mutex> lk(mapMutex_);
        devices_[key] = md;
    }
    broadcast("device_added", md->summary());
    md->applySettings();
    md->readState();
    // a receiver re-plug resets the current host's stored name to a factory default;
    // write this computer's hostname back so Easy-Switch shows a meaningful name
    try {
        json st = md->summary()["state"];
        if (st.contains("hosts") && md->dev().has(hidpp::HOSTS_INFO)) {
            int cur = st["hosts"].value("current", 0);
            std::string name = st["hosts"]["names"].size() > static_cast<size_t>(cur) ? st["hosts"]["names"][cur].value("name", "") : "";
            std::string host = platform::hostName().substr(0, 24);
            // factory names start with the maker's name, which the receiver reports as the first word of its HID name
            std::string rname = md->transport().info().name, maker = rname.substr(0, rname.find(' '));
            bool factory = name.empty() || name == "Bolt receiver" || (maker.size() >= 4 && name.rfind(maker.substr(0, 4), 0) == 0);
            if (factory && !host.empty() && name != host) {
                INFO("%s: host name is '%s', setting it to '%s'", md->dev().name().c_str(), name.c_str(), host.c_str());
                md->dev().setHostName(cur, host);
                md->readState(true);
            }
        }
    } catch (...) {
    }
    broadcast("device", md->summary());
    // the first battery answer after a (re)link is the value the firmware stored before
    // sleeping; re-read once the device has had time to measure
    std::thread([this, md] {
        for (int delayMs : {2500, 10000}) {
            std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));
            try {
                auto b = md->dev().battery();
                if (b) {
                    md->setBattery(b, true);
                    if (b->known) recordBattery(md->id(), b->percent, b->charging);
                    broadcast("battery", {{"id", md->id()}, {"battery", md->batteryJson()}});
                }
            } catch (...) {
            }
        }
    }).detach();
    return true;
}

// ------------------------------------------------------------- Bolt pairing
// Registers and notifications follow the receiver protocol as implemented in Solaar:
//   discovery: SET_REGISTER 0xC0 [timeout, 1=start/2=cancel]; 0x53 status; 0x4F discovered device
//   pairing:   SET_LONG_REGISTER 0xC1 [1=pair/2=cancel/3=unpair, slot, addr(6), auth, entropy]; 0x54 status
//   passkey:   0x4D request (6 ASCII digits), 0x4E key pressed
static const char* kindName(uint8_t k) { return k == 1 ? "keyboard" : k == 2 ? "mouse" : k == 3 ? "numpad" : k == 4 ? "presenter" : k == 8 ? "trackpad" : "device"; }

void Daemon::pairBroadcast(const std::string& status) {
    json found = json::array();
    if (!pair_.address.empty() && !pair_.name.empty()) {
        char addr[20];
        snprintf(addr, sizeof(addr), "%02x%02x%02x%02x%02x%02x", pair_.address[0], pair_.address[1], pair_.address[2], pair_.address[3], pair_.address[4], pair_.address[5]);
        found.push_back({{"name", pair_.name}, {"kind", kindName(pair_.kind)}, {"address", addr}, {"passkey", pair_.passkey}, {"authentication", pair_.authentication}});
    }
    int remaining = pair_.active ? std::max(0, pair_.timeoutSec - static_cast<int>(std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - pair_.started).count())) : 0;
    json ev = {{"status", status}, {"found", found}, {"timeout", remaining}, {"discovering", pair_.discovering}, {"lock_open", pair_.lockOpen}};
    if (!pair_.error.empty()) ev["error"] = pair_.error;
    if (!pair_.doneName.empty()) ev["done"] = pair_.doneName + " paired";
    if (!pair_.passkey.empty()) ev["passkey"] = pair_.passkey;
    broadcast("pair", ev);
    if (!pair_.active && pairing_.exchange(false)) {
        // pairing just ended: look for the new device (or clean up) once the bus is quiet again
        std::thread([this] { std::this_thread::sleep_for(1200ms); scan(); }).detach();
    }
}

void Daemon::pairStart() {
    std::lock_guard<std::mutex> lk(pairMutex_);
    hidpp::Transport* bolt = nullptr;
    {
        std::lock_guard<std::mutex> ml(mapMutex_);
        for (auto& [path, t] : transports_)
            if (t->info().product == 0xC548) { bolt = t.get(); break; }
    }
    if (!bolt) throw std::runtime_error("no Bolt receiver connected");
    pair_ = PairingSession{};
    pair_.transport = bolt;
    pair_.active = true;
    pairing_.store(true);
    pair_.started = std::chrono::steady_clock::now();
    try {
        bolt->request10(0xFF, 0x80, 0xC0, {static_cast<uint8_t>(pair_.timeoutSec), 0x01});
    } catch (const hidpp::Timeout&) {
        // the Bolt receiver confirms through the 0x53 discovery status notification instead of a reply
    }
    INFO("pairing: discovery started on %s", bolt->path().c_str());
    pairBroadcast("discovering");
}

void Daemon::pairCancel() {
    std::lock_guard<std::mutex> lk(pairMutex_);
    if (!pair_.active || !pair_.transport) { pairing_.store(false); return; }
    try {
        if (pair_.lockOpen) pair_.transport->request10(0xFF, 0x82, 0xC1, {0x02}, true);
        if (pair_.discovering) pair_.transport->request10(0xFF, 0x80, 0xC0, {0x00, 0x02});
    } catch (...) {
    }
    pair_.active = false;
    INFO("pairing: cancelled");
    pairBroadcast("cancelled");
}

void Daemon::onReceiverNotification(hidpp::Transport& t, const hidpp::Notification& n) {
    std::lock_guard<std::mutex> lk(pairMutex_);
    if (!pair_.active || pair_.transport != &t) return;
    const auto& d = n.data;
    switch (n.featureIndex) {
        case 0x53: {  // discovery status
            pair_.discovering = n.address == 0x00;
            if (!d.empty() && d[0]) { pair_.error = d[0] == 1 ? "No device found before the timeout" : "Discovery failed"; pair_.active = false; }
            if (pair_.discovering) { pair_.counter = -1; pair_.address.clear(); pair_.name.clear(); }
            pairBroadcast(pair_.discovering ? "discovering" : (pair_.error.empty() ? "discovery_closed" : "error"));
            break;
        }
        case 0x4F: {  // discovered device (two parts: 0 = ids, 1 = name)
            if (d.size() < 3) break;
            int counter = n.address + d[0] * 256;
            if (pair_.counter < 0) pair_.counter = counter;
            else if (pair_.counter != counter) break;
            if (d[1] == 0 && d.size() >= 15) {
                pair_.kind = d[3];
                pair_.address.assign(d.begin() + 6, d.begin() + 12);
                pair_.authentication = d[14];
            } else if (d[1] == 1 && d.size() >= 3) {
                size_t len = std::min<size_t>(d[2], d.size() - 3);
                pair_.name.assign(reinterpret_cast<const char*>(d.data() + 3), len);
            }
            if (!pair_.address.empty() && !pair_.name.empty() && !pair_.lockOpen) {
                INFO("pairing: found %s (%s), pairing", pair_.name.c_str(), kindName(pair_.kind));
                pairBroadcast("found");
                hidpp::Bytes p = {0x01, 0x00};
                p.insert(p.end(), pair_.address.begin(), pair_.address.end());
                p.push_back(pair_.authentication);
                p.push_back(pair_.kind == 1 ? 20 : 10);
                // a slot still holding an older pairing of the same product (re-pair after a Bluetooth
                // detour, for example) makes the receiver refuse the new one: release it first
                uint8_t wantKind = pair_.kind;
                std::thread([this, tp = &t, p, wantKind] {
                    try {
                        for (uint8_t slot = 1; slot <= 6; ++slot) {
                            auto pi = tp->pairingInfo(slot);
                            if (!pi || pi->kind != wantKind) continue;
                            bool alive = false;
                            for (auto& md : snapshot()) if (&md->transport() == tp && md->dev().index() == slot) alive = linkAlive(*md);
                            if (alive) continue;   // a live unit of the same kind: leave it alone
                            INFO("pairing: releasing slot %d (stale %s pairing, wpid %04x) before re-pairing", slot, kindName(pi->kind), pi->wpid);
                            try { tp->request10(0xFF, 0x82, 0xC1, {0x03, slot}, true); } catch (...) {}
                        }
                        tp->request10(0xFF, 0x82, 0xC1, p, true);
                    } catch (const std::exception& e) { std::lock_guard<std::mutex> l(pairMutex_); pair_.error = std::string("pair request failed: ") + e.what(); pairBroadcast("error"); }
                }).detach();
            }
            break;
        }
        case 0x54: {  // pairing status
            pair_.lockOpen = n.address == 0x00;
            uint8_t err = d.empty() ? 0 : d[0];
            if (err) {
                static const char* kErr[] = {"", "the device did not answer in time", "pairing failed", "the receiver refused (too many devices or a stale pairing)", "the device declined", "wrong passkey"};
                pair_.error = std::string("Pairing failed: ") + (err < 6 ? kErr[err] : "receiver error " + std::to_string(err));
                INFO("pairing: status error %d", err);
                pair_.active = false; pairBroadcast("error"); break;
            }
            if (n.address == 0x02) { pair_.doneName = pair_.name.empty() ? "Device" : pair_.name; pair_.active = false; INFO("pairing: %s paired as device %d", pair_.doneName.c_str(), d.size() > 7 ? d[7] : 0); pairBroadcast("done"); }
            else pairBroadcast(pair_.lockOpen ? "pairing" : "lock_closed");
            break;
        }
        case 0x4D: {  // passkey request
            pair_.passkey.assign(reinterpret_cast<const char*>(d.data()), std::min<size_t>(6, d.size()));
            INFO("pairing: passkey %s", pair_.passkey.c_str());
            pairBroadcast("passkey");
            break;
        }
        case 0x4E:
            pairBroadcast("passkey_pressed");
            break;
        default:
            break;
    }
}

void Daemon::onNotification(hidpp::Transport& t, const hidpp::Notification& n) {
    // runs on the transport's reader thread: must never wait on locks held during device I/O
    if (n.deviceIndex == 0xFF && (n.featureIndex == 0x4D || n.featureIndex == 0x4E || n.featureIndex == 0x4F || n.featureIndex == 0x53 || n.featureIndex == 0x54)) {
        onReceiverNotification(t, n);
        return;
    }
    if (n.featureIndex == 0x41 && n.reportId == 0x10) {  // receiver: device connect / disconnect
        bool linkDown = !n.data.empty() && (n.data[0] & 0x40);
        DevPtr md;
        for (auto& m : snapshot())
            if (&m->transport() == &t && m->dev().index() == n.deviceIndex) md = m;
        if (linkDown) {
            // tell the UI the device is out of reach; the summary is built off this reader thread
            if (md && md->online()) { md->setOnline(false); std::thread([this, md] { broadcast("device", md->summary()); }).detach(); }
            return;
        }
        if (pairing_.load()) return;   // the pairing path attaches the new device once the handshake is done
        if (md) {
            md->setOnline(true);
            std::thread([this, md] { std::this_thread::sleep_for(800ms); md->reapply(); broadcast("device", md->summary()); }).detach();
        } else {
            hidpp::Node node{t.path(), t.info().name, t.info().vendor, t.info().product, t.info().bustype};
            uint8_t idx = n.deviceIndex;
            hidpp::Transport* tp = &t;
            std::thread([this, tp, idx, node] {
                std::this_thread::sleep_for(1000ms);
                std::lock_guard<std::mutex> scanLock(scanMutex_);
                attach(*tp, idx, node);
            }).detach();
        }
        return;
    }
    for (auto& md : snapshot()) {
        if (&md->transport() != &t || md->dev().index() != n.deviceIndex) continue;
        auto ev = md->dev().classify(n);
        if (ev) {
            DEBUG("%s: %s %s", md->dev().name().c_str(), ev->kind.c_str(), ev->data.dump().c_str());
            md->handle(*ev);
        }
    }
}

void Daemon::changeHostFrom(ManagedDevice& src, int host) {
    try { src.dev().changeHost(host); } catch (...) {}
    if (!config_.data()["general"].value("linked_easy_switch", false)) return;
    for (auto& md : snapshot()) {
        if (md.get() == &src) continue;
        std::thread([md, host] { std::this_thread::sleep_for(150ms); try { md->dev().changeHost(host); } catch (...) {} }).detach();
    }
}

// Checks and clamps a settings write. Throws on unknown keys or wrong types.
static json validateSetting(const json& summary, const std::vector<std::string>& path, const json& vIn) {
    json v = vIn;
    if (path.empty()) throw std::runtime_error("empty setting path");
    const json& st = summary.value("state", json::object());
    if (v.is_string()) {   // "2" from a data attribute is 2
        const std::string& sv = v.get_ref<const std::string&>();
        if (!sv.empty() && sv.find_first_not_of("-0123456789.") == std::string::npos) v = json(std::atof(sv.c_str()));
    }
    auto clampInt = [&](int lo, int hi) {
        if (!v.is_number()) throw std::runtime_error(path.back() + " must be a number");
        return json(std::max(lo, std::min(hi, static_cast<int>(std::lround(v.get<double>())))));
    };
    auto boolean = [&]() { if (!v.is_boolean()) throw std::runtime_error(path.back() + " must be true or false"); return v; };
    auto oneOf = [&](std::initializer_list<const char*> opts) {
        if (!v.is_string()) throw std::runtime_error(path.back() + " must be a string");
        for (auto o : opts) if (v.get<std::string>() == o) return v;
        throw std::runtime_error("invalid value for " + path.back());
    };
    const std::string& k = path[0];
    if (k == "dpi") {
        int lo = 200, hi = 8000, step = 50;
        if (st.contains("dpi") && st["dpi"].value("stepped", false) && st["dpi"]["levels"].size() == 3) {
            lo = st["dpi"]["levels"][0]; hi = st["dpi"]["levels"][1]; step = std::max(1, st["dpi"]["levels"][2].get<int>());
        }
        json c = clampInt(lo, hi);
        return json(lo + ((c.get<int>() - lo) / step) * step);
    }
    if (k == "pointer_speed") { if (!v.is_number()) throw std::runtime_error("pointer_speed must be a number"); return json(std::max(-1.0, std::min(1.0, v.get<double>()))); }
    if (k == "fn_swap" || k == "keep_layout") return boolean();
    if (k == "disable_keys" && path.size() == 2) {
        for (auto n : {"caps_lock", "num_lock", "scroll_lock", "insert", "win"}) if (path[1] == n) return boolean();
    }
    // a gaming mouse: DPI slots, report rates and the HITS switches (kept until the features are mapped)
    if (k == "dpi_slots" && path.size() == 2) {
        int lo = 100, hi = 48000;
        if (st.contains("dpi") && st["dpi"].contains("slots") && st["dpi"]["levels"].size() == 3) {
            lo = st["dpi"]["levels"][0];
            hi = st["dpi"]["levels"][1];
        }
        int want = clampInt(lo, hi).get<int>();
        // onto the sensor's own steps (1 under 200 ... 200 above 32000), the nearest one
        if (st.contains("dpi") && st["dpi"].contains("ranges"))
            for (auto& r : st["dpi"]["ranges"]) {
                int from = r[0], step = r[1], to = r[2];
                if (want < from || want > to || step <= 0) continue;
                return json(std::min(to, from + (want - from + step / 2) / step * step));
            }
        return json(want);
    }
    if (k == "bunny_hop" && path.size() == 2) {
        if (path[1] == "enabled") return boolean();
        if (path[1] == "timeout") {
            json c = clampInt(100, 1000);
            return json((c.get<int>() + 50) / 100 * 100);
        }   // ms, G HUB's 100 ms steps
    }
    if (k == "dpi_enabled" && path.size() == 2) return boolean();
    if (k == "dpi_active") return clampInt(0, 4);
    if (k == "report_rate" || k == "report_rate_wired") {
        int want = v.is_number() ? static_cast<int>(std::lround(v.get<double>())) : v.is_string() ? std::atoi(v.get<std::string>().c_str())
                                                                                                  : 0;
        static const int rates[] = {125, 250, 500, 1000, 2000, 4000, 8000};
        int best = 1000;
        for (int r : rates)
            if (std::abs(r - want) < std::abs(best - want)) best = r;
        return json(best);
    }
    if (k == "hits" && path.size() == 2) {
        if (path[1] == "actuation") return clampInt(1, 10);
        if (path[1] == "rapid_trigger") return clampInt(1, 5);
        if (path[1] == "rapid_trigger_on") return boolean();
        if (path[1] == "haptics") return clampInt(0, 5);
    }
    if (k == "smartshift" && path.size() == 2) {
        if (path[1] == "mode") return oneOf({"ratchet", "freespin"});
        if (path[1] == "enabled") return boolean();
        if (path[1] == "threshold") return clampInt(1, 255);
        if (path[1] == "torque") return clampInt(1, 100);
    }
    if (k == "haptic" && path.size() == 2) {
        if (path[1] == "enabled" || path[1] == "ring" || path[1] == "gestures") return boolean();
        if (path[1] == "level") return clampInt(1, 100);
    }
    if (k == "panel_force") {
        const json fb = st.value("force", json::array());
        if (fb.empty()) throw std::runtime_error("this device has no force-sensing button");
        return clampInt(fb[0].value("min", 0), fb[0].value("max", 65535));
    }
    auto speed = [&]() { if (!v.is_number()) throw std::runtime_error(path.back() + " must be a number"); return json(std::round(std::max(0.25, std::min(3.0, v.get<double>())) * 20) / 20); };
    if (k == "hires" && path.size() == 2 && (path[1] == "enabled" || path[1] == "invert" || path[1] == "smooth" || path[1] == "momentum")) return boolean();
    if (k == "thumbwheel" && path.size() == 2 && (path[1] == "invert" || path[1] == "smooth")) return boolean();
    if ((k == "hires" || k == "thumbwheel") && path.size() == 2 && path[1] == "speed") return speed();
    if (k == "backlight" && path.size() == 2) {
        if (path[1] == "enabled" || path[1] == "battery_saving") return boolean();
        if (path[1] == "mode") return oneOf({"auto", "manual", "temporary"});
        if (path[1] == "level") return clampInt(0, std::max(0, st.value("backlight", json::object()).value("num_levels", 8) - 1));
        if (path[1] == "duration_hands_out" || path[1] == "duration_hands_in") return clampInt(1, 600);
        if (path[1] == "duration_powered") return clampInt(1, 7200);   // the firmware's most is two hours
    }
    throw std::runtime_error("unknown setting " + k + (path.size() > 1 ? "." + path[1] : ""));
}

// battery history: one sample per device per hour, kept for 14 days, in the state dir
static std::string statePath(const std::string& name) { return platform::stateDir() + "/" + name; }
static std::mutex gHistMutex;
static void recordBattery(const std::string& id, int percent, bool charging) {
    std::lock_guard<std::mutex> lk(gHistMutex);
    std::string file = statePath("battery-" + id + ".json");
    json arr = json::array();
    { std::ifstream f(platform::fsPath(file)); if (f) { try { arr = json::parse(f); } catch (...) {} } }
    if (!arr.is_array()) arr = json::array();
    long now = static_cast<long>(std::time(nullptr));
    if (!arr.empty() && now - arr.back().value("t", 0L) < 3600 && arr.back().value("p", -1) == percent) return;
    if (!arr.empty() && now - arr.back().value("t", 0L) < 900) arr.erase(arr.size() - 1);
    arr.push_back({{"t", now}, {"p", percent}, {"c", charging}});
    while (!arr.empty() && now - arr.front().value("t", 0L) > 14 * 86400) arr.erase(arr.begin());
    std::ofstream f(platform::fsPath(file));
    f << arr.dump();
}
static json batteryHistory(const std::string& id) {
    std::lock_guard<std::mutex> lk(gHistMutex);
    std::string file = statePath("battery-" + id + ".json");
    json arr = json::array();
    { std::ifstream f(platform::fsPath(file)); if (f) { try { arr = json::parse(f); } catch (...) {} } }
    // 14 half-day buckets over the last 7 days, most recent last; empty buckets carry the previous value
    long now = static_cast<long>(std::time(nullptr));
    std::vector<int> buckets(14, -1);
    for (auto& e : arr) {
        long t = e.value("t", 0L);
        long age = now - t;
        if (age < 0 || age >= 7 * 86400) continue;
        int b = 13 - static_cast<int>(age / 43200);
        buckets[b] = e.value("p", 0);
    }
    int last = -1;
    for (auto& b : buckets) { if (b < 0) b = last; else last = b; }
    json out = json::array();
    for (int b : buckets) if (b >= 0) out.push_back(b);
    return out;
}

// The app in front picks each device's profile. A dialog or pop-up of the program whose window had
// the profile keeps it (LibreOffice's dialogs report "Soffice", its document window
// "libreoffice-writer"), and so does a moment with nothing in front, so the buttons do not flip
// back and forth while working in one program. Only dialogs: every LibreOffice app shares one
// process, so a Calc window must not inherit Writer's profile.
void Daemon::onApp(const std::string& cls) {
    appClass_ = cls;
    int pid = tracker_ ? tracker_->pid() : 0;
    auto devs = snapshot();
    bool matches = false;
    for (auto& md : devs) if (!cls.empty() && md->hasAppProfile(cls)) matches = true;
    // LogiMX's own windows are neutral: looking at its settings keeps the app you came from
    std::string lc = cls;
    for (auto& ch : lc) ch = static_cast<char>(tolower(static_cast<unsigned char>(ch)));
    const bool ours = lc == "logimx" || lc == "notlogi";   // the window class before and after the rename
    std::string eff = cls;
    if (matches) { profileApp_ = cls; profilePid_ = pid; }
    else if (ours) eff = profileApp_;
    else if (!profileApp_.empty() && (cls.empty() || (pid && pid == profilePid_ && tracker_->transient()))) eff = profileApp_;
    else { profileApp_.clear(); profilePid_ = 0; }
    for (auto& md : devs) md->setProfile(eff);
    broadcast("app", {{"app", cls}, {"profile_app", eff}});
}

json Daemon::rpc(const std::string& method, const json& p) {
    auto need = [&](const json& params) -> DevPtr {
        auto md = find(params.value("id", ""));
        if (!md) throw std::runtime_error("no such device");
        return md;
    };
    if (method == "ping") return "pong";
    if (method == "shutdown") { stop(); return true; }
    if (method == "audio_get") {
        auto a = platform::audioGet();
        if (!a.ok) throw std::runtime_error("audio is not handled by the agent on this system");
        return {{"volume", a.volume}, {"muted", a.muted}, {"mic_muted", a.micMuted}};
    }
    if (method == "audio_set") {
        if (!p.contains("volume") || !p["volume"].is_number()) throw std::runtime_error("volume must be a number");
        int v = std::max(0, std::min(100, static_cast<int>(std::lround(p["volume"].get<double>()))));
        if (!platform::audioSetVolume(v)) throw std::runtime_error("cannot set the volume on this system");
        return json{{"volume", v}};
    }
    if (method == "status")
    {
        std::string recv;
        {
            std::lock_guard<std::mutex> lk(mapMutex_);
            std::set<uint16_t> seen;
            for (auto& [path, t] : transports_) {
                auto it = hidpp::kReceivers.find(t->info().product);
                if (it != hidpp::kReceivers.end() && seen.insert(t->info().product).second) recv += (recv.empty() ? "" : ", ") + it->second + " receiver";
            }
        }
        return {{"devices", snapshot().size()}, {"app", appClass_}, {"tracker", tracker_->backend()}, {"version", "0.12.5"},
            {"conflicts", platform::conflictingTools()}, {"input_monitoring", platform::inputMonitoring()}, {"os", platform::name()}, {"general", config_.data()["general"]}, {"config_path", config_.path()}, {"receivers", recv}, {"paused", paused_.load()}};
    }
    if (method == "logs") {
        std::lock_guard<std::mutex> lk(gLogMutex);
        return json(std::vector<std::string>(gLogRing.begin(), gLogRing.end()));
    }
    if (method == "applications") return cachedApplications();
    if (method == "record_start") {
        // grab the keyboard so combinations the window manager reserves (Alt+Tab, Super,
        // Ctrl+Alt+arrow) reach the recorder instead of switching windows
        bool ok = recorder_.start(
            [this](const std::vector<std::string>& chord) { broadcast("record", {{"keys", chord}, {"done", false}}); },
            [this](const std::vector<std::string>& chord, bool timeout) { broadcast("record", {{"keys", chord}, {"done", true}, {"timeout", timeout}}); });
        if (!ok) throw std::runtime_error("cannot grab the keyboard on this session");
        return json{{"ok", true}};
    }
    if (method == "record_cancel") { recorder_.cancel(); return json{{"ok", true}}; }
    if (method == "hidpp") {
        // one raw HID++ 2.0 request to a device, for diagnostics: feature id, function, parameter bytes
        auto md = need(p);
        uint16_t feature = static_cast<uint16_t>(std::stoul(p.value("feature", "0"), nullptr, 16));
        hidpp::Bytes params;
        for (auto& b : p.value("params", json::array())) params.push_back(static_cast<uint8_t>(b.is_string() ? std::stoul(b.get<std::string>(), nullptr, 16) : b.get<int>()));
        try {
            hidpp::Bytes r = md->dev().req(feature, static_cast<uint8_t>(p.value("fn", 0)), params);
            json out = json::array();
            for (auto b : r) {
                char h[4];
                snprintf(h, sizeof(h), "%02X", b);
                out.push_back(h);
            }
            return json{{"reply", out}};
        } catch (const hidpp::HidppError& e) {
            return json{{"error", e.code}};
        }
    }
    if (method == "haptic_play") {
        auto md = need(p);
        md->dev().playHaptic(p.value("waveform", 0));
        return json{{"ok", true}};
    }
    if (method == "haptic_cue") {
        // a cue is feedback for something the user just did; whether it is felt is the device's setting
        auto md = need(p);
        return json{{"ok", md->cue(p.value("cue", ""))}};
    }
    if (method == "skip_taskbar") return json{{"ok", apps::skipTaskbar(static_cast<unsigned long>(p.value("xid", 0.0)))}};
    if (method == "running_apps") {
        // window classes of everything open, matched against the installed desktop entries so
        // the caller gets a name and an icon rather than a bare class
        json all = cachedApplications();
        auto lower = [](std::string v) { for (auto& c : v) c = static_cast<char>(tolower(c)); return v; };
        std::vector<std::string> classes = apps::runningWindowClasses();
        std::set<std::string> added;
        json out = json::array();
        for (auto& cls : classes) {
            std::string lc = lower(cls);
            if (lc.empty() || added.count(lc)) continue;
            added.insert(lc);
            const json* hit = nullptr;
            for (auto& a : all) {
                if (lower(a.value("wm_class", "")) == lc || lower(a.value("id", "")) == lc || lower(a.value("name", "")) == lc) { hit = &a; break; }
            }
            if (hit) { json e = *hit; e["wm_class"] = cls; out.push_back(e); }
            else out.push_back({{"id", ""}, {"name", cls}, {"icon", ""}, {"wm_class", cls}});
        }
        std::sort(out.begin(), out.end(), [](const json& a, const json& b) { return a.value("name", "") < b.value("name", ""); });
        return out;
    }
    if (method == "set_general") {
        static const std::map<std::string, std::string> kinds = {
            {"linked_easy_switch", "bool"}, {"desktop", "string"}, {"notify_low", "bool"}, {"notify_connect", "bool"},
            {"notify_low_threshold", "number"}, {"osd_enabled", "bool"}, {"osd_position", "string"}, {"osd_duration", "number"}, {"osd_events", "object"},
            {"ring", "object"}};
        for (auto& [k, v] : p.items()) {
            auto it = kinds.find(k);
            if (it == kinds.end()) throw std::runtime_error("unknown general setting " + k);
            const std::string& kind = it->second;
            if ((kind == "bool" && !v.is_boolean()) || (kind == "string" && !v.is_string()) || (kind == "number" && !v.is_number()) || (kind == "object" && !v.is_object()))
                throw std::runtime_error(k + " has the wrong type");
            if (k == "osd_position" && v != "top" && v != "center" && v != "bottom") throw std::runtime_error("osd_position must be top, center or bottom");
            if (k == "notify_low_threshold") config_.data()["general"][k] = std::max(5, std::min(50, static_cast<int>(v.get<double>())));
            else if (k == "osd_duration") config_.data()["general"][k] = std::max(500, std::min(4000, static_cast<int>(v.get<double>())));
            else config_.data()["general"][k] = v;
        }
        config_.save();
        // whether the ring takes the mouse's movement is part of its settings: apply it at once
        if (p.contains("ring")) for (auto& md : snapshot()) { try { md->applyAssignments(); } catch (...) {} }
        return config_.data()["general"];
    }
    // where the pointer is, for Flow's screen edges (X11; null where the agent cannot tell)
    if (method == "pointer") {
        int x = 0, y = 0;
        bool ctrl = false;
        if (apps::pointerPosition(x, y, ctrl)) return json{{"x", x}, {"y", y}, {"ctrl", ctrl}};
        return nullptr;
    }
    // the display's refresh rate, from the app: smooth scrolling plays one step a frame
    // Flow: put the pointer where it enters from the other computer
    if (method == "warp_pointer") return json{{"ok", apps::warpPointer(p.value("x", 0), p.value("y", 0))}};
    // Flow: devices are being switched to this computer; look for them every 150 ms for a while
    if (method == "expect_device") {
        long long ms = std::max(500LL, std::min(15000LL, static_cast<long long>(p.value("ms", 5000.0))));
        expectUntil_ = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count() + ms;
        INFO("expecting a new device for %lld ms", ms);
        return true;
    }
    if (method == "set_display") {
        if (p.contains("hz") && p["hz"].is_number()) actions::Smoother::setFrameRate(p["hz"].get<double>());
        return true;
    }
    if (method == "set_host_name") {
        auto md = need(p);
        md->dev().setHostName(p["host"].get<int>(), p["name"].get<std::string>());
        md->readState(true);
        json s = md->summary();
        broadcast("device", s);
        return s;
    }
    if (method == "export_config") return config_.data();
    if (method == "battery_history") return batteryHistory(p.value("id", ""));
    if (method == "list_backups") return config_.listBackups();
    if (method == "create_backup") { return json(config_.backup(p.value("note", "Manual"))); }
    if (method == "restore_backup") {
        if (!config_.restoreBackup(p.value("file", ""))) throw std::runtime_error("backup not found");
        for (auto& md : snapshot()) { md->refreshConfig(); md->reapply(); }
        return true;
    }
    if (method == "sync_from_device") {
        auto md = need(p);
        json st = md->readState(true);
        json& settings = config_.device(md->pid(), md->dev().kind())["settings"];
        if (st.contains("dpi")) settings["dpi"] = st["dpi"]["dpi"];
        if (st.contains("dpi") && st["dpi"].contains("slots")) {
            for (size_t i = 0; i < st["dpi"]["slots"].size(); ++i) settings["dpi_slots"][std::to_string(i)] = st["dpi"]["slots"][i];
            if (st["dpi"].value("active", -1) >= 0) settings["dpi_active"] = st["dpi"]["active"];
        }
        if (st.contains("report_rate")) {
            if (st["report_rate"]["report_rate"].is_number()) settings["report_rate"] = st["report_rate"]["report_rate"];
            if (st["report_rate"]["report_rate_wired"].is_number()) settings["report_rate_wired"] = st["report_rate"]["report_rate_wired"];
        }
        if (st.contains("hits") && !st["hits"]["buttons"].empty()) {
            const json& b = st["hits"]["buttons"][0];
            for (auto k : {"actuation", "rapid_trigger", "rapid_trigger_on", "haptics"}) settings["hits"][k] = b[k];
        }
        if (st.contains("bunny_hop")) {
            settings["bunny_hop"]["enabled"] = st["bunny_hop"].value("enabled", false);
            if (st["bunny_hop"]["timeout"].is_number()) settings["bunny_hop"]["timeout"] = st["bunny_hop"]["timeout"];
        }
        if (st.contains("smartshift")) {
            settings["smartshift"]["mode"] = st["smartshift"]["mode"];
            settings["smartshift"]["enabled"] = st["smartshift"]["enabled"];
            if (st["smartshift"]["enabled"].get<bool>()) settings["smartshift"]["threshold"] = st["smartshift"]["threshold"];
        }
        if (st.contains("hires")) { settings["hires"]["enabled"] = st["hires"]["hires"]; settings["hires"]["invert"] = st["hires"]["invert"]; }
        if (st.contains("thumbwheel")) settings["thumbwheel"]["invert"] = st["thumbwheel"]["invert"];
        if (st.contains("backlight")) {
            settings["backlight"]["enabled"] = st["backlight"]["enabled"];
            settings["backlight"]["mode"] = st["backlight"]["mode"].get<int>() == 3 ? "manual" : "auto";
            if (st["backlight"]["mode"].get<int>() == 3) settings["backlight"]["level"] = st["backlight"]["level"];
            settings["backlight"]["duration_hands_out"] = st["backlight"]["duration_hands_out"];
            settings["backlight"]["duration_hands_in"] = st["backlight"]["duration_hands_in"];
            settings["backlight"]["duration_powered"] = st["backlight"]["duration_powered"];
        }
        config_.save();
        md->refreshConfig();
        json s = md->summary();
        broadcast("device", s);
        return s;
    }
    if (method == "import_config") {
        if (!p.contains("config") || !p["config"].is_object()) throw std::runtime_error("config object required");
        config_.backup("Before import");
        json cfg = p["config"];
        if (!cfg.contains("devices") || !cfg["devices"].is_object()) cfg["devices"] = json::object();
        if (!cfg.contains("general") || !cfg["general"].is_object()) cfg["general"] = json::object();
        for (auto& [id, dev] : cfg["devices"].items())
            if (!dev.is_object() || !dev.value("profiles", json::object()).is_object() || !dev.value("settings", json::object()).is_object())
                throw std::runtime_error("device " + id + " must have settings and profiles objects");
        config_.data() = cfg;
        config_.save();
        for (auto& md : snapshot()) { md->refreshConfig(); md->reapply(); }
        return true;
    }
    if (method == "reset_device") {
        auto md = need(p);
        config_.backup("Before reset");
        config_.data()["devices"].erase(Config::key(md->pid()));
        config_.save();
        config_.device(md->pid(), md->dev().kind());
        md->refreshConfig();
        md->reapply();
        return md->summary();
    }
    if (method == "devices") {
        json out = json::array();
        for (auto& md : snapshot()) out.push_back(md->summary());
        return out;
    }
    if (method == "device") {
        auto md = need(p);
        md->readState();
        return md->summary();
    }
    if (method == "config") return config_.data();
    if (method == "presets") return actions::presets();
    if (method == "run_action") {
        // any action a control could be assigned, run now (the action ring picks one at the pointer);
        // with a device id it goes through that device's engine so host switching and DPI work too
        json a = p.value("action", json::object());
        if (a.is_string()) {
            std::string k = a.get<std::string>();
            const json& all = actions::presets()["all"];
            if (!all.contains(k)) throw std::runtime_error("unknown preset " + k);
            a = all[k];
            a["preset"] = k;
        }
        std::string t = a.value("type", "");
        if (t.empty() || t == "gesture" || t == "native" || t == "adapter" || t == "hold") throw std::runtime_error("cannot run an action of type " + t);
        if (p.contains("id") && p["id"].is_string()) {
            try { need(p)->play(a); return json{{"ok", true}}; } catch (const std::exception&) { /* device gone: run without it */ }
        }
        actions::DeviceOps ops;
        ops.uiEvent = [this](const std::string& k) { broadcast("action", {{"kind", k}}); };
        actions::Engine eng(injector(), ops);
        eng.play(a);
        return json{{"ok", true}};
    }
    if (method == "play_action") {
        json a = p.value("action", json::object());
        if (a.is_string()) { auto all = actions::presets()["all"]; if (!all.contains(a.get<std::string>())) throw std::runtime_error("unknown preset"); a = all[a.get<std::string>()]; }
        std::string t = a.value("type", "");
        if (t != "keystroke" && t != "type_text" && t != "button" && t != "scroll") throw std::runtime_error("play_action accepts keystroke, type_text, button or scroll");
        actions::Engine eng(injector(), actions::DeviceOps{});
        eng.play(a);
        return json{{"ok", true}};
    }
    if (method == "divert_state") {
        auto md = need(p);
        json out = json::array();
        const json& labels = controlLabels();
        for (auto& [cid, ctl] : md->dev().controls()) {
            if (!ctl.divertable()) continue;
            json row = {{"cid", cid}, {"label", labels.value(std::to_string(cid), "")}, {"wanted", md->isDiverted(cid)}};
            try { auto [flags, remap] = md->dev().getReporting(cid); row["diverted"] = (flags & 0x01) != 0; row["raw_xy"] = (flags & 0x10) != 0; row["remap"] = remap; }
            catch (const std::exception& e) { row["error"] = e.what(); }
            out.push_back(row);
        }
        return out;
    }
    if (method == "defaults") {
        static const json defaults = json::parse(kDefaultsJson);
        if (p.contains("id")) { auto md = need(p); std::string k = Config::key(md->pid()); return defaults.contains(k) ? defaults[k] : json::object(); }
        return defaults;
    }
    if (method == "set_setting") {
        auto md = need(p);
        auto path = p["path"].get<std::vector<std::string>>();
        json value = validateSetting(md->summary(), path, p["value"]);
        auto t0 = std::chrono::steady_clock::now();
        auto ms = [&]() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count(); };
        config_.setSetting(md->pid(), path, value);
        long tSave = ms();
        md->refreshConfig();
        md->applySettings(path[0]);
        long tApply = ms();
        if (path[0] == "thumbwheel") md->applyAssignments();
        json st = md->readState(false);
        long tRead = ms();
        broadcast("device", md->summary());
        DEBUG("set_setting %s: save %ld ms, apply %ld ms, read %ld ms, total %ld ms", path[0].c_str(), tSave, tApply - tSave, tRead - tApply, ms());
        return st;
    }
    if (method == "set_assignment") {
        auto md = need(p);
        std::string section = p["section"].get<std::string>();
        if (section != "buttons" && section != "keys" && section != "thumbwheel") throw std::runtime_error("section must be buttons, keys or thumbwheel");
        std::string control = p.value("control", "");
        if (section != "thumbwheel") {
            int cid = -1;
            try { cid = std::stoi(control); } catch (...) {}
            if (cid < 0 || !md->dev().controls().count(static_cast<uint16_t>(cid))) throw std::runtime_error("unknown control " + control);
        }
        const json& action = p["action"];
        if (!(action.is_string() || action.is_object())) throw std::runtime_error("action must be a preset name or an action object");
        config_.setAssignment(md->pid(), p.value("profile", "default"), section, control, action);
        md->refreshConfig();
        md->applyAssignments();
        json s = md->summary();
        broadcast("device", s);
        return s;
    }
    if (method == "set_profiles") {
        auto md = need(p);
        if (!p.contains("profiles") || !p["profiles"].is_object() || !p["profiles"].contains("default") || !p["profiles"]["default"].is_object())
            throw std::runtime_error("profiles must be an object with a default profile");
        for (auto& [k, prof] : p["profiles"].items()) if (!prof.is_object()) throw std::runtime_error("profile " + k + " must be an object");
        config_.device(md->pid(), "")["profiles"] = p["profiles"];
        config_.save();
        md->refreshConfig();
        md->setProfile(appClass_);
        md->applyAssignments();
        json s = md->summary();
        broadcast("device", s);
        return s;
    }
    if (method == "change_host") {
        auto md = need(p);
        int host = p["host"].get<int>();
        try {
            md->dev().changeHost(host);
        } catch (const hidpp::Timeout&) {
            // the device switches away before it acknowledges: that is success
        } catch (const std::exception& e) {
            WARN("%s: change host to %d: %s", md->dev().name().c_str(), host + 1, e.what());
            throw;
        }
        return true;
    }
    if (method == "pair_start") { pairStart(); return true; }
    if (method == "pair_cancel") { pairCancel(); return true; }
    if (method == "pair_status") { std::lock_guard<std::mutex> lk(pairMutex_); return {{"active", pair_.active}, {"discovering", pair_.discovering}, {"name", pair_.name}, {"error", pair_.error}, {"passkey", pair_.passkey}}; }
    if (method == "pause_diversion" || method == "resume_diversion") {
        bool pause = method == "pause_diversion";
        if (pause != paused_) {
            paused_ = pause;
            for (auto& md : snapshot()) { if (pause) md->releaseAll(); else md->reapply(); }
            INFO("diversion %s", pause ? "paused" : "resumed");
            broadcast("paused", {{"paused", pause}});
        }
        return pause;
    }
    if (method == "reload") {
        config_.load();
        for (auto& md : snapshot()) {
            md->refreshConfig();
            md->reapply();
        }
        return true;
    }
    throw std::runtime_error("unknown method " + method);
}
