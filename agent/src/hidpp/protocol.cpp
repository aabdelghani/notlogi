#include <algorithm>
#include <cctype>
#include <tuple>
#include "protocol.h"

#include <filesystem>
#include <fstream>

#include "../platform/platform.h"

#include <cstdio>
#include <cstring>

namespace hidpp {

static const std::map<int, std::string> kDeviceTypes = {
    {0, "keyboard"}, {1, "remote"}, {2, "numpad"}, {3, "mouse"}, {4, "trackpad"}, {5, "trackball"},
    {6, "presenter"}, {7, "receiver"}, {8, "headset"}, {9, "webcam"}, {10, "steering wheel"}};

static inline uint16_t be16(const Bytes& b, size_t i) { return static_cast<uint16_t>((b[i] << 8) | b[i + 1]); }
static inline int16_t sbe16(const Bytes& b, size_t i) { return static_cast<int16_t>(be16(b, i)); }
static inline uint16_t le16(const Bytes& b, size_t i) { return static_cast<uint16_t>(b[i] | (b[i + 1] << 8)); }

Bytes Device::req(uint16_t feature, uint8_t fn, const Bytes& params, bool noReply) {
    auto it = features_.find(feature);
    if (it == features_.end()) throw HidppError(0x06, 0, fn << 4);
    return t_.request(index_, it->second.index, fn, params, std::nullopt, noReply);
}

const FeatureInfo* Device::featureByIndex(uint8_t idx) const {
    for (auto& [id, f] : features_)
        if (f.index == idx) return &f;
    return nullptr;
}

bool Device::enumerate() {
    auto pv = t_.ping(index_);
    if (!pv || pv->first < 2) return false;
    features_.clear();
    features_[ROOT] = {ROOT, 0, 0, 0};
    Bytes r = t_.request(index_, 0, 0, {static_cast<uint8_t>(FEATURE_SET >> 8), static_cast<uint8_t>(FEATURE_SET & 0xFF)}, std::nullopt);
    if (r.size() < 3 || r[0] == 0) return false;
    uint8_t fs = r[0];
    features_[FEATURE_SET] = {FEATURE_SET, fs, r[2], 0};
    // a device seen before is not read again (as Options+ does): its firmware and serial in a few
    // requests, then its feature table, controls and names from the cache
    if (loadCache()) return true;
    int count = t_.request(index_, fs, 0, {}, std::nullopt)[0];
    for (int i = 1; i <= count; ++i) {
        Bytes fr = t_.request(index_, fs, 1, {static_cast<uint8_t>(i)}, std::nullopt);
        if (fr.size() < 4) continue;
        uint16_t fid = be16(fr, 0);
        features_[fid] = {fid, static_cast<uint8_t>(i), fr[3], fr[2]};
    }
    readIdentity();
    if (has(SPECIAL_KEYS)) readControls();
    else if (has(MOUSE_BUTTON_SPY)) synthesizeControls();
    saveCache();
    return true;
}

// ------------------------------------------------------------ the device cache
// One file per device (by serial) in the state folder: its feature table, controls and names, kept
// while its firmware is the same. Reading a device costs a hundred requests, slow over Bluetooth;
// a reconnect then takes a few.
static std::string cachePath(const std::string& serial) {
    std::string safe;
    for (char c : serial) if (isalnum(static_cast<unsigned char>(c))) safe += c;
    return platform::stateDir() + "/devices/" + safe + ".json";
}
bool Device::loadCache() {
    try {
        Bytes r = t_.request(index_, 0, 0, {static_cast<uint8_t>(DEVICE_FW >> 8), static_cast<uint8_t>(DEVICE_FW & 0xFF)}, std::nullopt);
        if (r.size() < 3 || r[0] == 0) return false;
        features_[DEVICE_FW] = {DEVICE_FW, r[0], r[2], r[1]};
        readFirmware();
        if (serial_.empty() || firmware_.empty()) return false;
        std::ifstream f(cachePath(serial_));
        if (!f) return false;
        json c = json::parse(f);
        if (c.value("firmware", "") != firmware_ || c.value("v", 0) != 1) return false;
        for (auto& x : c["features"]) {
            uint16_t id = x["id"].get<uint16_t>();
            features_[id] = {id, x["index"].get<uint8_t>(), x["version"].get<uint8_t>(), x["type"].get<uint8_t>()};
        }
        controls_.clear();
        for (auto& x : c["controls"]) {
            ControlInfo k;
            k.cid = x["cid"]; k.taskId = x["task"]; k.flags = x["flags"]; k.position = x["position"];
            k.group = x["group"]; k.groupMask = x["mask"]; k.extraFlags = x["extra"];
            controls_[k.cid] = k;
        }
        name_ = c.value("name", ""); friendlyName_ = c.value("friendly", ""); kind_ = c.value("kind", "unknown");
        return !name_.empty();
    } catch (const std::exception&) {
        return false;
    }
}
void Device::saveCache() {
    if (serial_.empty() || firmware_.empty() || name_.empty()) return;
    try {
        json c = {{"v", 1}, {"firmware", firmware_}, {"name", name_}, {"friendly", friendlyName_}, {"kind", kind_}, {"features", json::array()}, {"controls", json::array()}};
        for (auto& [id, fi] : features_) c["features"].push_back({{"id", id}, {"index", fi.index}, {"version", fi.version}, {"type", fi.type}});
        for (auto& [cid, k] : controls_)
            c["controls"].push_back({{"cid", k.cid}, {"task", k.taskId}, {"flags", k.flags}, {"position", k.position}, {"group", k.group}, {"mask", k.groupMask}, {"extra", k.extraFlags}});
        std::string p = cachePath(serial_);
        std::filesystem::create_directories(std::filesystem::path(p).parent_path());
        std::ofstream(p) << c.dump();
    } catch (const std::exception&) {
    }
}

void Device::readIdentity() {
    try {
        if (has(DEVICE_NAME)) {
            int n = req(DEVICE_NAME, 0)[0];
            std::string name;
            while (static_cast<int>(name.size()) < n) {
                Bytes r = req(DEVICE_NAME, 1, {static_cast<uint8_t>(name.size())});
                if (r.empty()) break;
                name.append(reinterpret_cast<const char*>(r.data()), r.size());
            }
            name_ = name.substr(0, n);
            int type = req(DEVICE_NAME, 2)[0];
            auto it = kDeviceTypes.find(type);
            kind_ = it == kDeviceTypes.end() ? "unknown" : it->second;
        }
    } catch (const std::exception&) {
    }
    try {
        if (has(FRIENDLY_NAME)) {
            int n = req(FRIENDLY_NAME, 0)[0];
            std::string fn;
            while (static_cast<int>(fn.size()) < n) {
                Bytes r = req(FRIENDLY_NAME, 1, {static_cast<uint8_t>(fn.size())});
                if (r.size() < 2) break;
                fn.append(reinterpret_cast<const char*>(r.data() + 1), r.size() - 1);
            }
            friendlyName_ = fn.substr(0, n);
        }
    } catch (const std::exception&) {
    }
    readFirmware();
}

void Device::readFirmware() {
    try {
        if (has(DEVICE_FW)) {
            Bytes info = req(DEVICE_FW, 0);
            int cnt = info.empty() ? 0 : info[0];
            // the main firmware: entity type 0 in the old layout; newer devices (0x0003 v9, the PRO X3
            // SUPERSTRIKE) number their entities differently and flag the active one (bit 0 of byte 8),
            // so an active entry with a readable prefix is taken when no type-0 entry exists
            std::string fallback;
            for (int e = 0; e < cnt; ++e) {
                Bytes r = req(DEVICE_FW, 1, {static_cast<uint8_t>(e)});
                if (r.size() < 8) continue;
                std::string prefix;
                for (int i = 1; i <= 3; ++i)
                    if (isprint(r[i])) prefix += static_cast<char>(r[i]);
                char buf[48];
                snprintf(buf, sizeof(buf), "%s %02X.%02X.B%04X", prefix.c_str(), r[4], r[5], be16(r, 6));
                if (r[0] == 0) firmware_ = buf;
                else if (fallback.empty() && r.size() >= 9 && (r[8] & 0x01) && !prefix.empty() && isalpha(static_cast<unsigned char>(prefix[0]))) fallback = buf;
            }
            if (firmware_.empty()) firmware_ = fallback;
            if (features_[DEVICE_FW].version >= 4) {
                Bytes r = req(DEVICE_FW, 2);
                std::string s(reinterpret_cast<const char*>(r.data()), std::min<size_t>(12, r.size()));
                while (!s.empty() && s.back() == '\0') s.pop_back();
                serial_ = s;
            }
        }
    } catch (const std::exception&) {
    }
}

// 0x0003 getDeviceInfo (v4 and later): unit id (bytes 1..4) and the first model id (bytes 7..8), for a
// device on a receiver that answers no pairing register (LIGHTSPEED)
std::optional<std::pair<uint16_t, std::string>> Device::deviceInfo() {
    if (!has(DEVICE_FW)) return std::nullopt;
    try {
        Bytes r = req(DEVICE_FW, 0);
        if (r.size() < 9) return std::nullopt;
        uint16_t pid = be16(r, 7);
        if (!pid) return std::nullopt;
        char s[9];
        snprintf(s, sizeof(s), "%02X%02X%02X%02X", r[1], r[2], r[3], r[4]);
        return std::make_pair(pid, std::string(s));
    } catch (const std::exception&) {
        return std::nullopt;
    }
}

// a gaming mouse without 0x1B04 (PRO X3 SUPERSTRIKE): its buttons come from the button spy (0x8110),
// as many as it reports, in G HUB's order (left, right, middle, back, forward); every one divertable
void Device::synthesizeControls() {
    controls_.clear();
    int n = spyButtonCount();
    static const uint16_t cids[] = {0x50, 0x51, 0x52, 0x53, 0x56};
    for (int i = 0; i < n && i < 16; ++i) {
        ControlInfo c;
        c.cid = i < 5 ? cids[i] : static_cast<uint16_t>(0x57 + i - 5);
        c.taskId = c.cid;
        c.flags = 0x01 | 0x20;   // mouse button, divertable
        c.position = static_cast<uint8_t>(i + 1);
        controls_[c.cid] = c;
    }
}

void Device::readControls() {
    controls_.clear();
    int cnt = req(SPECIAL_KEYS, 0)[0];
    for (int i = 0; i < cnt; ++i) {
        Bytes r = req(SPECIAL_KEYS, 1, {static_cast<uint8_t>(i)});
        if (r.size() < 9) continue;
        ControlInfo c;
        c.cid = be16(r, 0);
        c.taskId = be16(r, 2);
        c.flags = r[4];
        c.position = r[5];
        c.group = r[6];
        c.groupMask = r[7];
        c.extraFlags = r[8];
        controls_[c.cid] = c;
    }
}

Battery Device::decodeBattery(const Bytes& r) {
    Battery b;
    if (r.size() < 3) return b;
    b.percent = r[0];
    static const std::map<int, std::string> lv = {{8, "full"}, {4, "good"}, {2, "low"}, {1, "critical"}};
    auto it = lv.find(r[1]);
    b.level = it == lv.end() ? "unknown" : it->second;
    b.charging = r[2] >= 1 && r[2] <= 3;
    b.externalPower = r.size() > 3 && r[3];
    return b;
}

// 0x1000, on older devices such as the original MX Keys: level in percent, next level, status
// (0 discharging, 1 recharging, 2 almost full, 3 full, 4 slow recharge, 5+ battery or thermal error)
// A level of 0 is not "empty": these devices send 0 while charging, when they do not measure it;
// "full" (3) is 100% on the charger.
Battery Device::decodeBatteryStatus(const Bytes& r) {
    Battery b;
    if (r.size() < 3) return b;
    const int status = r[2];
    b.charging = status == 1 || status == 2 || status == 4;
    b.externalPower = status >= 1 && status <= 4;
    if (status == 3) { b.percent = 100; b.level = "full"; return b; }
    if (r[0] == 0) { b.known = false; b.level = "unknown"; return b; }
    b.percent = r[0];
    b.level = b.percent <= 5 ? "critical" : b.percent <= 20 ? "low" : b.percent >= 90 ? "full" : "good";
    return b;
}

std::optional<Battery> Device::battery() {
    if (has(UNIFIED_BATTERY)) return decodeBattery(req(UNIFIED_BATTERY, 1));
    if (has(BATTERY_STATUS)) return decodeBatteryStatus(req(BATTERY_STATUS, 0));
    return std::nullopt;
}

std::pair<uint8_t, uint16_t> Device::getReporting(uint16_t cid) {
    Bytes r = req(SPECIAL_KEYS, 2, {static_cast<uint8_t>(cid >> 8), static_cast<uint8_t>(cid)});
    return {r[2], be16(r, 3)};
}

void Device::setReporting(uint16_t cid, std::optional<bool> divert, std::optional<bool> rawXY, uint16_t remap) {
    uint8_t flags = 0;
    if (divert) flags |= 0x02 | (*divert ? 0x01 : 0);
    if (rawXY) flags |= 0x20 | (*rawXY ? 0x10 : 0);
    req(SPECIAL_KEYS, 3, {static_cast<uint8_t>(cid >> 8), static_cast<uint8_t>(cid), flags,
                          static_cast<uint8_t>(remap >> 8), static_cast<uint8_t>(remap)});
}

std::optional<SmartShiftState> Device::smartshift() {
    if (has(SMART_SHIFT)) {
        Bytes r = req(SMART_SHIFT, 0);
        return SmartShiftState{r[0], r[1], r[2]};
    }
    if (has(SMART_SHIFT_ENHANCED)) {
        // capabilities: flags (bit 0 = torque can be tuned), default threshold, default torque
        Bytes cap = req(SMART_SHIFT_ENHANCED, 0);
        Bytes r = req(SMART_SHIFT_ENHANCED, 1);
        SmartShiftState s;
        s.mode = r[0]; s.threshold = r[1]; s.torque = r[2];
        s.tunable = (cap[0] & 0x01) != 0; s.defaultThreshold = cap[1]; s.defaultTorque = cap[2];
        return s;
    }
    return std::nullopt;
}

void Device::setSmartshift(int mode, int threshold, int torque) {
    // zero leaves a field as it is
    Bytes p = {static_cast<uint8_t>(mode), static_cast<uint8_t>(threshold), static_cast<uint8_t>(torque)};
    if (has(SMART_SHIFT)) req(SMART_SHIFT, 1, {p[0], p[1], 0});
    else if (has(SMART_SHIFT_ENHANCED)) req(SMART_SHIFT_ENHANCED, 2, p);
}

std::optional<HapticState> Device::haptic() {
    if (!has(HAPTIC)) return std::nullopt;
    Bytes cap = req(HAPTIC, 0);
    Bytes cfg = req(HAPTIC, 1);
    HapticState h;
    h.waveforms = (static_cast<uint32_t>(cap[4]) << 24) | (static_cast<uint32_t>(cap[5]) << 16) | (static_cast<uint32_t>(cap[6]) << 8) | cap[7];
    h.enabled = (cfg[0] & 0x01) != 0;
    h.level = cfg[1];
    h.discrete = (cfg[2] & 0x01) != 0;
    return h;
}

void Device::setHaptic(bool enabled, int level) {
    if (!has(HAPTIC)) return;
    level = std::max(1, std::min(100, level));   // the level is kept while feedback is off
    req(HAPTIC, 2, {static_cast<uint8_t>(enabled ? 1 : 0), static_cast<uint8_t>(level)});
}

void Device::playHaptic(int waveform) {
    if (!has(HAPTIC)) return;
    req(HAPTIC, 4, {static_cast<uint8_t>(waveform)});
}

std::vector<ForceButton> Device::forceButtons() {
    std::vector<ForceButton> out;
    if (!has(FORCE_BUTTON)) return out;
    int n = req(FORCE_BUTTON, 0)[0];
    for (int i = 0; i < n && i < 8; ++i) {
        Bytes info = req(FORCE_BUTTON, 1, {static_cast<uint8_t>(i)});
        Bytes cur = req(FORCE_BUTTON, 2, {static_cast<uint8_t>(i)});
        auto u16 = [](const Bytes& b, size_t o) { return (static_cast<int>(b[o]) << 8) | b[o + 1]; };
        ForceButton f;
        f.index = i;
        f.changeable = (u16(info, 0) & 0x01) != 0;
        f.def = u16(info, 2); f.max = u16(info, 4); f.min = u16(info, 6);
        f.current = u16(cur, 0);
        out.push_back(f);
    }
    return out;
}

void Device::setForce(int index, int value) {
    if (!has(FORCE_BUTTON)) return;
    req(FORCE_BUTTON, 3, {static_cast<uint8_t>(index), static_cast<uint8_t>(value >> 8), static_cast<uint8_t>(value)});
}

std::optional<HiResState> Device::hires() {
    if (!has(HIRES_WHEEL)) return std::nullopt;
    Bytes cap = req(HIRES_WHEEL, 0);
    uint8_t mode = req(HIRES_WHEEL, 1)[0];
    HiResState s;
    s.hidppTarget = mode & 0x01;
    s.hires = mode & 0x02;
    s.invert = mode & 0x04;
    s.multiplier = cap[0];
    s.hasInvert = cap[1] & 0x08;
    s.hasRatchetSwitch = cap[1] & 0x04;
    return s;
}

void Device::setHires(bool hidppTarget, bool hires, bool invert) {
    req(HIRES_WHEEL, 2, {static_cast<uint8_t>((hidppTarget ? 1 : 0) | (hires ? 2 : 0) | (invert ? 4 : 0))});
}

std::optional<ThumbWheelState> Device::thumbwheel() {
    if (!has(THUMB_WHEEL)) return std::nullopt;
    Bytes info = req(THUMB_WHEEL, 0);
    Bytes st = req(THUMB_WHEEL, 1);
    ThumbWheelState s;
    s.diverted = st[0] & 0x01;
    s.invert = st[1] & 0x01;
    s.nativeRes = be16(info, 0);
    s.divertedRes = be16(info, 2);
    s.capabilities = info[4];
    return s;
}

void Device::setThumbwheel(bool diverted, bool invert) {
    req(THUMB_WHEEL, 2, {static_cast<uint8_t>(diverted), static_cast<uint8_t>(invert)});
}

std::optional<DpiState> Device::dpi() {
    if (!has(ADJUSTABLE_DPI)) return std::nullopt;
    Bytes r = req(ADJUSTABLE_DPI, 2, {0});
    DpiState s;
    s.dpi = be16(r, 1);
    s.def = be16(r, 3);
    Bytes lst = req(ADJUSTABLE_DPI, 1, {0});
    std::vector<int> vals;
    for (size_t i = 1; i + 1 < lst.size(); i += 2) {
        uint16_t v = be16(lst, i);
        if (v == 0) break;
        if ((v & 0xE000) == 0xE000) {
            s.stepped = true;
            vals.push_back(v & 0x1FFF);
        } else {
            vals.push_back(v);
        }
    }
    if (s.stepped && vals.size() >= 3) s.levels = {vals[0], vals[2], vals[1]};  // min, max, step
    else s.levels = vals;
    return s;
}

void Device::setDpi(int dpi) {
    req(ADJUSTABLE_DPI, 3, {0, static_cast<uint8_t>(dpi >> 8), static_cast<uint8_t>(dpi)});
}

// ---------------------------------------------------------------- G-series features
// 0x2202 Extended adjustable DPI, sensor 0: fn3 getSensorDpiList (five slots), fn4 getSensorLodList,
// fn5 getSensorDpiParameters (sensor, dpiX, defX, dpiY, defY, lod), fn6 setSensorDpiParameters (sensor,
// dpiX, dpiY, lod); fn2 getSensorDpiRanges gives the stepped table the sensor accepts
std::optional<ExtendedDpiState> Device::extendedDpi() {
    if (!has(EXTENDED_DPI)) return std::nullopt;
    ExtendedDpiState s;
    // fn5 getDpi(sensor): the X DPI and its default, the Y DPI and its default, the lift-off distance
    Bytes p = req(EXTENDED_DPI, 5, {0});
    if (p.size() < 10) return std::nullopt;
    s.dpi = be16(p, 1);
    s.def = be16(p, 3);
    s.dpiY = be16(p, 5);
    s.lod = p[9];
    Bytes l = req(EXTENDED_DPI, 3, {0});
    for (size_t i = 2; i + 1 < l.size() && s.slots.size() < 5; i += 2) {
        int v = be16(l, i);
        if (!v) break;
        s.slots.push_back(v);
    }
    try {
        Bytes lods = req(EXTENDED_DPI, 4, {0});
        for (size_t i = 1; i < lods.size() && i <= s.slots.size(); ++i) s.lods.push_back(lods[i]);
    } catch (const std::exception&) {
    }
    try {
        // the table of values the sensor takes, over as many pages as it fills: a value, then
        // pairs of a step (0xE000 | step) and the value it steps up to; 0 ends it
        // (the pages carry a byte stream: a value can start on one page and end on the next)
        Bytes raw;
        std::vector<int> seq;
        for (uint8_t page = 0; page < 8; ++page) {
            Bytes r = req(EXTENDED_DPI, 2, {0, 0, page});
            if (r.size() <= 3) break;
            raw.insert(raw.end(), r.begin() + 3, r.end());
            bool end = false;
            seq.clear();
            for (size_t i = 0; i + 1 < raw.size(); i += 2) {
                int v = be16(raw, i);
                if (!v) {
                    end = true;
                    break;
                }
                seq.push_back(v);
            }
            if (end) break;
        }
        int from = 0, step = 0;
        for (int v : seq) {
            if ((v & 0xE000) == 0xE000) {
                step = v & 0x1FFF;
                continue;
            }
            if (from && step) s.ranges.push_back({from, step, v});
            from = v;
            step = 0;
        }
        if (!s.ranges.empty()) {
            s.min = s.ranges.front()[0];
            s.max = s.ranges.back()[2];
        }
    } catch (const std::exception&) {
    }
    return s;
}
void Device::setExtendedDpi(int dpi, int lod) { setExtendedDpi(dpi, dpi, lod); }
// fn6 setDpi(sensor, X, Y, lift-off): the lift-off distance 1 low, 2 medium, 3 high (0 keeps the one set)
void Device::setExtendedDpi(int x, int y, int lod) {
    if (!lod) {
        try {
            Bytes p = req(EXTENDED_DPI, 5, {0});
            if (p.size() >= 10) lod = p[9];
        } catch (const std::exception&) {}
        if (!lod) lod = 2;
    }
    req(EXTENDED_DPI, 6, {0, static_cast<uint8_t>(x >> 8), static_cast<uint8_t>(x), static_cast<uint8_t>(y >> 8), static_cast<uint8_t>(y), static_cast<uint8_t>(lod)});
}

// 0x8061 Extended report rate: fn0 getReportRateList(conn) -> bitmask of the rates a link offers (bit n
// = index n), fn2 getReportRate(conn) -> index, fn3 setReportRate(index) for the link in use; conn 0
// wired, 1 wireless
static const int kReportRates[] = {125, 250, 500, 1000, 2000, 4000, 8000};
const char* Device::reportRateName(int index) {
    static const char* names[] = {"125", "250", "500", "1000", "2000", "4000", "8000"};
    return index >= 0 && index < 7 ? names[index] : "?";
}
std::optional<ReportRateState> Device::reportRate() {
    if (!has(EXTENDED_REPORT_RATE)) return std::nullopt;
    ReportRateState s;
    for (uint8_t conn = 0; conn < 2; ++conn) {
        int mask = 0, idx = -1;
        try {
            Bytes r = req(EXTENDED_REPORT_RATE, 0, {conn});
            if (r.size() >= 2) mask = r[1];
        } catch (const std::exception&) {}
        try {
            Bytes r = req(EXTENDED_REPORT_RATE, 2, {conn});
            if (!r.empty()) idx = r[0];
        } catch (const std::exception&) {}
        if (conn) {
            s.wirelessMask = mask;
            s.wireless = idx;
        } else {
            s.wiredMask = mask;
            s.wired = idx;
        }
    }
    if (s.wireless < 0 && s.wired < 0) return std::nullopt;
    return s;
}
void Device::setReportRate(int index) { req(EXTENDED_REPORT_RATE, 3, {static_cast<uint8_t>(index)}); }

// 0x1B0C Analog buttons (HITS): fn0 getCapabilities (?, settings per button, max actuation, max rapid
// trigger, max haptics, ?), fn1 setConfig(button, actuation, rapid, haptics), fn2 getConfig(button),
// fn3 setMonitoringMode(options, timeout s), fn4 getMonitoringMode. Each value is the step times 4;
// the rapid trigger's bit 0 is its switch. Button 0 is the left button, 1 the right one. With
// monitoring on (G HUB's latency test sends 01 3C: travel reports for 60 s) event 0 reports how far
// each button is pressed, the left one's step then the right one's, 0 (up) to 10 (the bottom).
std::optional<AnalogCaps> Device::analogCaps() {
    if (!has(ANALOG_BUTTONS)) return std::nullopt;
    Bytes r = req(ANALOG_BUTTONS, 0);
    if (r.size() < 5) return std::nullopt;
    AnalogCaps c;
    c.buttons = 2;
    c.maxActuation = r[2] / 4;
    c.maxRapidTrigger = r[3] / 4;
    c.maxHaptics = r[4] / 4;
    return c;
}
std::optional<AnalogButton> Device::analogButton(int button) {
    if (!has(ANALOG_BUTTONS)) return std::nullopt;
    Bytes r = req(ANALOG_BUTTONS, 2, {static_cast<uint8_t>(button)});
    if (r.size() < 4) return std::nullopt;
    AnalogButton b;
    b.actuation = r[1] / 4;
    b.rapidTrigger = r[2] / 4;
    b.rapidTriggerOn = (r[2] & 0x01) != 0;
    b.haptics = r[3] / 4;
    return b;
}
void Device::setAnalogButton(int button, const AnalogButton& b) {
    auto clamp = [](int v, int lo, int hi) { return std::max(lo, std::min(hi, v)); };
    req(ANALOG_BUTTONS, 1, {static_cast<uint8_t>(button), static_cast<uint8_t>(clamp(b.actuation, 1, 10) * 4), static_cast<uint8_t>(clamp(b.rapidTrigger, 1, 5) * 4 | (b.rapidTriggerOn ? 1 : 0)), static_cast<uint8_t>(clamp(b.haptics, 0, 5) * 4)});
}
void Device::setAnalogMonitoring(bool buttonEvents, int timeoutSec) {
    req(ANALOG_BUTTONS, 3, {static_cast<uint8_t>(buttonEvents ? 1 : 0), static_cast<uint8_t>(timeoutSec)});
}

// 0x8100 Onboard profiles: fn1 setOnboardMode (1 = the mouse's own profile, 2 = host software), fn2 getOnboardMode
std::optional<int> Device::onboardMode() {
    if (!has(ONBOARD_PROFILES)) return std::nullopt;
    Bytes r = req(ONBOARD_PROFILES, 2);
    return r.empty() ? std::nullopt : std::optional<int>(r[0]);
}
void Device::setOnboardMode(int mode) { req(ONBOARD_PROFILES, 1, {static_cast<uint8_t>(mode)}); }
// fn0 getInfo: memory model, profile format, macro format, profiles, profiles out of the box,
// buttons, sectors, sector size (16 bit), ... (the PRO X3 SUPERSTRIKE: 01 08 01 05 01 05 10 00 FF,
// format 8, five profiles and buttons, 16 sectors of 255 bytes); fn3/fn4 set/get the profile in
// use (its sector, 16 bit); fn5 reads 16 bytes of a sector from an offset
std::optional<OnboardInfo> Device::onboardInfo() {
    if (!has(ONBOARD_PROFILES)) return std::nullopt;
    Bytes r = req(ONBOARD_PROFILES, 0);
    if (r.size() < 9) return std::nullopt;
    OnboardInfo i;
    i.format = r[1];
    i.profiles = r[3];
    i.buttons = r[5];
    i.sectors = r[6];
    i.sectorSize = be16(r, 7);
    return i;
}
int Device::onboardProfile() {
    Bytes r = req(ONBOARD_PROFILES, 4);
    return r.size() >= 2 ? be16(r, 0) : 0;
}
void Device::setOnboardProfile(int sector) { req(ONBOARD_PROFILES, 3, {static_cast<uint8_t>(sector >> 8), static_cast<uint8_t>(sector)}); }
Bytes Device::readSector(int sector, int size) {
    Bytes out;
    for (int off = 0; off < size; off += 16) {
        // the last read of a sector starts 16 bytes before its end: a read past it is refused
        int at = std::min(off, std::max(0, size - 16));
        Bytes r = req(ONBOARD_PROFILES, 5, {static_cast<uint8_t>(sector >> 8), static_cast<uint8_t>(sector), static_cast<uint8_t>(at >> 8), static_cast<uint8_t>(at)});
        r.resize(16);
        out.resize(static_cast<size_t>(at));
        out.insert(out.end(), r.begin(), r.end());
    }
    out.resize(static_cast<size_t>(size));
    return out;
}

// fn6 begins a write (sector, offset, length, 16 bit each), fn7 takes 16 bytes at a time, fn8 ends
// it; fn10 gives the CRC of a sector. A sector ends with its CRC-CCITT (from 0xFFFF), high byte first.
void Device::writeSector(int sector, const Bytes& data) {
    const size_t n = data.size();
    req(ONBOARD_PROFILES, 6, {static_cast<uint8_t>(sector >> 8), static_cast<uint8_t>(sector), 0, 0, static_cast<uint8_t>(n >> 8), static_cast<uint8_t>(n)});
    for (size_t off = 0; off < n; off += 16) {
        Bytes chunk(data.begin() + static_cast<long>(off), data.begin() + static_cast<long>(std::min(n, off + 16)));
        chunk.resize(16, 0);
        req(ONBOARD_PROFILES, 7, chunk);
    }
    req(ONBOARD_PROFILES, 8);
}
uint16_t Device::sectorCrc(int sector) {
    Bytes r = req(ONBOARD_PROFILES, 10, {static_cast<uint8_t>(sector >> 8), static_cast<uint8_t>(sector)});
    return r.size() >= 2 ? static_cast<uint16_t>(be16(r, 0)) : 0;
}
uint16_t Device::crcCcitt(const Bytes& b, size_t n) {
    uint16_t c = 0xFFFF;
    for (size_t i = 0; i < n && i < b.size(); ++i) {
        c ^= static_cast<uint16_t>(b[i] << 8);
        for (int k = 0; k < 8; ++k) c = (c & 0x8000) ? static_cast<uint16_t>((c << 1) ^ 0x1021) : static_cast<uint16_t>(c << 1);
    }
    return c;
}

// 0x8090 Mode status: fn0 get (2 bytes), fn1 set (the 2 bytes and a 2-byte mask of the bits to
// change), fn2 the capabilities. Byte 1 bits 1-2 hold the surface mode as G HUB's Gaming Surface
// Mode sets it: 0 automatic, 1 on (tuned for a gaming surface), 2 off (any surface)
std::optional<int> Device::surfaceMode() {
    if (!has(MODE_STATUS)) return std::nullopt;
    Bytes r = req(MODE_STATUS, 0);
    if (r.size() < 2) return std::nullopt;
    return (r[1] >> 1) & 0x03;
}
void Device::setSurfaceMode(int mode) { req(MODE_STATUS, 1, {0, static_cast<uint8_t>((mode & 0x03) << 1), 0, 0x06}); }

// 0x80E0 Bunny hopping: fn0 getCapabilities, fn1 getTimeout, fn2 setTimeout. The timeout is in 10 ms
// steps (G HUB offers 100..1000 ms); 0 turns it off
std::optional<int> Device::bunnyHopTimeout() {
    if (!has(BUNNY_HOPPING)) return std::nullopt;
    Bytes r = req(BUNNY_HOPPING, 1);
    if (r.empty()) return std::nullopt;
    return r[0];
}
void Device::setBunnyHopTimeout(int t) { req(BUNNY_HOPPING, 2, {static_cast<uint8_t>(std::max(0, std::min(255, t)))}); }

// 0x8110 Mouse button spy: fn0 getButtonCount, fn1 startSpy, fn2 stopSpy, fn3 getRemapping (the HID
// button each physical button sends, 1 based, 0 = none), fn4 setRemapping; event 0 = the buttons down
int Device::spyButtonCount() {
    if (!has(MOUSE_BUTTON_SPY)) return 0;
    Bytes r = req(MOUSE_BUTTON_SPY, 0);
    return r.empty() ? 0 : r[0];
}
Bytes Device::spyButtonMap() {
    Bytes r = req(MOUSE_BUTTON_SPY, 3);
    int n = spyButtonCount();
    r.resize(std::min<size_t>(r.size(), static_cast<size_t>(n)));
    return r;
}
void Device::setSpyButtonMap(const Bytes& map) { req(MOUSE_BUTTON_SPY, 4, map); }
void Device::spy(bool on) { req(MOUSE_BUTTON_SPY, on ? 1 : 2); }

std::optional<BacklightState> Device::backlight() {
    if (!has(BACKLIGHT2)) return std::nullopt;
    Bytes r = req(BACKLIGHT2, 0);
    if (r.size() < 12) return std::nullopt;
    BacklightState s;
    s.enabled = r[0];
    s.options = r[1];
    s.supported = r[2];
    s.effects = le16(r, 3);
    s.level = r[5];
    s.dho = le16(r, 6);
    s.dhi = le16(r, 8);
    s.dpow = le16(r, 10);
    try {
        Bytes i = req(BACKLIGHT2, 2);
        s.numLevels = i[0];
        s.currentLevel = i[1];
        s.status = i[2];
    } catch (const std::exception&) {
    }
    return s;
}

void Device::setBacklight(bool enabled, std::optional<int> mode, std::optional<int> level,
                          std::optional<int> dho, std::optional<int> dhi, std::optional<int> dpow) {
    auto cur = backlight();
    if (!cur) return;
    if (dho) cur->dho = *dho;
    if (dhi) cur->dhi = *dhi;
    if (dpow) cur->dpow = *dpow;
    int m = mode.value_or(cur->mode());
    uint8_t options = static_cast<uint8_t>((cur->options & 0x07) | ((m & 0x03) << 3));
    int lvl = level.value_or(cur->level);
    if (m != 3) lvl = 0;
    Bytes p = {static_cast<uint8_t>(enabled), options, 0xFF, static_cast<uint8_t>(lvl),
               static_cast<uint8_t>(cur->dho & 0xFF), static_cast<uint8_t>(cur->dho >> 8),
               static_cast<uint8_t>(cur->dhi & 0xFF), static_cast<uint8_t>(cur->dhi >> 8),
               static_cast<uint8_t>(cur->dpow & 0xFF), static_cast<uint8_t>(cur->dpow >> 8)};
    req(BACKLIGHT2, 1, p);
}

std::vector<HostInfo> Device::hosts() {
    std::vector<HostInfo> out;
    if (!has(HOSTS_INFO)) return out;
    Bytes st = req(HOSTS_INFO, 0);
    int caps = st[0], num = st[2];
    for (int h = 0; h < num; ++h) {
        Bytes r = req(HOSTS_INFO, 1, {static_cast<uint8_t>(h)});
        HostInfo hi;
        hi.index = h;
        hi.paired = r[1];
        hi.busType = r[2];
        int nlen = r[4];
        std::string name;
        if (caps & 0x01) {
            while (static_cast<int>(name.size()) < nlen) {
                Bytes piece = req(HOSTS_INFO, 3, {static_cast<uint8_t>(h), static_cast<uint8_t>(name.size())});
                size_t take = std::min<size_t>(14, nlen - name.size());
                if (piece.size() < 2 + take) take = piece.size() > 2 ? piece.size() - 2 : 0;
                if (take == 0) break;
                name.append(reinterpret_cast<const char*>(piece.data() + 2), take);
            }
        }
        // a name read only in part (the device stopped answering) can end in padding or inside a character
        if (auto z = name.find('\0'); z != std::string::npos) name.resize(z);
        size_t cut = name.size();
        while (cut > 0 && (static_cast<unsigned char>(name[cut - 1]) & 0xC0) == 0x80) --cut;
        if (cut > 0 && (static_cast<unsigned char>(name[cut - 1]) & 0x80)) {
            unsigned char lead = static_cast<unsigned char>(name[cut - 1]);
            size_t need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3
                : lead >= 0xC0                            ? 2
                                                          : 1;
            if (name.size() - (cut - 1) < need) name.resize(cut - 1);
        }
        hi.name = name;
        out.push_back(hi);
    }
    return out;
}

void Device::setHostName(int host, const std::string& name) {
    if (!has(HOSTS_INFO)) return;
    std::string n = name.substr(0, 24);
    for (size_t off = 0; off < n.size(); off += 14) {
        Bytes p = {static_cast<uint8_t>(host), static_cast<uint8_t>(off)};
        std::string chunk = n.substr(off, 14);
        p.insert(p.end(), chunk.begin(), chunk.end());
        req(HOSTS_INFO, 4, p);
    }
}

std::pair<int, int> Device::currentHost() {
    if (has(CHANGE_HOST)) {
        Bytes r = req(CHANGE_HOST, 0);
        return {r[0], r[1]};
    }
    if (has(HOSTS_INFO)) {
        Bytes r = req(HOSTS_INFO, 0);
        return {r[2], r[3]};
    }
    return {0, 0};
}

void Device::changeHost(int host) {
    if (!has(CHANGE_HOST)) throw std::runtime_error("device cannot switch hosts");
    int n = 3, cur = -1;
    try { std::tie(n, cur) = currentHost(); } catch (const Timeout&) { /* asleep: send the switch anyway */ }
    if (host < 0 || host >= n) throw std::runtime_error("host index out of range");
    if (host == cur) return;
    req(CHANGE_HOST, 1, {static_cast<uint8_t>(host)}, true);
}

// 0x40A3 is per host. The MX Keys S firmware does not accept 0xFF as "current host" (reads
// come back 0 and writes are ignored), so address the host the keyboard is connected to.
uint8_t Device::fnHost() {
    if (fnHost_ < 0) {
        try { fnHost_ = (has(CHANGE_HOST) || has(HOSTS_INFO)) ? currentHost().second : 0; } catch (...) { fnHost_ = 0; }
        if (fnHost_ < 0) fnHost_ = 0;
    }
    return static_cast<uint8_t>(fnHost_);
}

std::optional<bool> Device::fnInversion() {
    if (!has(FN_INVERSION_K375S)) return std::nullopt;
    Bytes r = req(FN_INVERSION_K375S, 0, {fnHost()});
    return r.size() > 1 && r[1];
}

void Device::setFnInversion(bool on) {
    if (has(FN_INVERSION_K375S)) req(FN_INVERSION_K375S, 1, {fnHost(), static_cast<uint8_t>(on)});
}

std::optional<DisableKeysState> Device::disableKeys() {
    if (!has(DISABLE_KEYS)) return std::nullopt;
    Bytes caps = req(DISABLE_KEYS, 0), cur = req(DISABLE_KEYS, 1);
    DisableKeysState s;
    s.supported = caps.empty() ? 0 : caps[0];
    s.disabled = cur.empty() ? 0 : cur[0];
    return s;
}

void Device::setDisabledKeys(int mask) {
    if (has(DISABLE_KEYS)) req(DISABLE_KEYS, 2, {static_cast<uint8_t>(mask)});
}

// getHostPlatform answers host, status, platform index, source (0 default, 1 detected by the
// keyboard, 2 set by software) and what the keyboard itself would pick
std::optional<PlatformState> Device::platform() {
    if (!has(MULTIPLATFORM)) return std::nullopt;
    Bytes r = req(MULTIPLATFORM, 2, {0xFF});
    if (r.size() < 5) return std::nullopt;
    return PlatformState{r[2], r[3], r[4]};
}

void Device::setPlatform(int platform) {
    if (has(MULTIPLATFORM)) req(MULTIPLATFORM, 3, {0xFF, static_cast<uint8_t>(platform)});
}

std::optional<Event> Device::classify(const Notification& n) const {
    if (n.deviceIndex != index_) return std::nullopt;
    const FeatureInfo* f = featureByIndex(n.featureIndex);
    if (!f) return std::nullopt;
    const Bytes& d = n.data;
    switch (f->id) {
        case SPECIAL_KEYS:
            if (n.event == 0 && d.size() >= 8) {
                json cids = json::array();
                for (int i = 0; i < 4; ++i) {
                    uint16_t c = be16(d, i * 2);
                    if (c) cids.push_back(c);
                }
                return Event{"buttons", {{"down", cids}}};
            }
            if (n.event == 1 && d.size() >= 4) return Event{"raw_xy", {{"dx", sbe16(d, 0)}, {"dy", sbe16(d, 2)}}};
            break;
        case MOUSE_BUTTON_SPY:
            if (n.event == 0 && d.size() >= 2) {
                static const uint16_t cids[] = {0x50, 0x51, 0x52, 0x53, 0x56};
                uint16_t mask = be16(d, 0);
                json down = json::array();
                for (int i = 0; i < 16; ++i)
                    if (mask & (1u << i)) down.push_back(i < 5 ? cids[i] : 0x57 + i - 5);
                return Event{"buttons", {{"down", down}}};
            }
            break;
        case EXTENDED_REPORT_RATE:
            if (n.event == 0 && d.size() >= 2) return Event{"report_rate", {{"wireless", d[0] == 1}, {"index", d[1]}}};
            break;
        case ANALOG_BUTTONS: {
            // with monitoring on (fn3): the inductive buttons' travel as they move
            json bytes = json::array();
            for (auto b : d) bytes.push_back(b);
            return Event{"analog", {{"event", n.event}, {"bytes", bytes}}};
        }
        case FN_INVERSION_K375S:
            if (n.event == 0 && d.size() >= 2) return Event{"fn_swap", {{"host", d[0]}, {"on", d[1] != 0}}};
            break;
        case THUMB_WHEEL:
            if (n.event == 0 && d.size() >= 5)
                return Event{"thumbwheel", {{"rotation", sbe16(d, 0)}, {"timestamp", be16(d, 2)}, {"status", d[4]}}};
            break;
        case HIRES_WHEEL:
            if (n.event == 0 && d.size() >= 3) return Event{"wheel", {{"hires", (d[0] & 0x10) != 0}, {"delta", sbe16(d, 1)}}};
            if (n.event == 1 && !d.empty()) return Event{"ratchet", {{"ratchet", d[0] != 0}}};
            break;
        case UNIFIED_BATTERY:
            if (n.event == 0) return Event{"battery", decodeBattery(d).toJson()};
            break;
        case BATTERY_STATUS:
            if (n.event == 0) return Event{"battery", decodeBatteryStatus(d).toJson()};
            break;
        case WIRELESS_STATUS:
            return Event{"wireless", {{"reconnect", !d.empty() && d[0] != 0}}};
        case CONFIG_CHANGE:
            return Event{"config_change", json::object()};
        case BACKLIGHT2:
            // Event 0 usually carries the level info ([levels, level, status], as function 2
            // answers). Some firmware also sends the configuration there ([enabled, options, ...],
            // as function 0), e.g. when a charger is plugged in; that reads as nonsense levels
            // ("13 of 0"), so anything that is not a plausible level is a configuration change.
            if (n.event == 0 && d.size() >= 3) {
                if (d[0] >= 2 && d[0] <= 16 && d[1] < d[0]) return Event{"backlight", {{"num_levels", d[0]}, {"level", d[1]}, {"status", d[2]}}};
                return Event{"backlight_config", json::object()};
            }
            break;
        default:
            break;
    }
    return std::nullopt;
}

}  // namespace hidpp
