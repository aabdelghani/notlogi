// HID++ 2.0 features used by the MX Master 3S and MX Keys S
#pragma once
#include <array>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "nlohmann/json.hpp"
#include "transport.h"

namespace hidpp {

using json = nlohmann::json;

enum Feature : uint16_t {
    ROOT = 0x0000,
    FEATURE_SET = 0x0001,
    DEVICE_FW = 0x0003,
    DEVICE_NAME = 0x0005,
    FRIENDLY_NAME = 0x0007,
    CONFIG_CHANGE = 0x0020,
    BATTERY_STATUS = 0x1000,
    UNIFIED_BATTERY = 0x1004,
    CHANGE_HOST = 0x1814,
    HOSTS_INFO = 0x1815,
    BACKLIGHT2 = 0x1982,
    HAPTIC = 0x19B0,
    FORCE_BUTTON = 0x19C0,
    SPECIAL_KEYS = 0x1B04,
    WIRELESS_STATUS = 0x1D4B,
    SMART_SHIFT = 0x2110,
    SMART_SHIFT_ENHANCED = 0x2111,
    HIRES_WHEEL = 0x2121,
    THUMB_WHEEL = 0x2150,
    ADJUSTABLE_DPI = 0x2201,
    EXTENDED_DPI = 0x2202,
    FN_INVERSION_K375S = 0x40A3,
    DISABLE_KEYS = 0x4521,
    MULTIPLATFORM = 0x4531,
    // G-series gaming mice (PRO X3 SUPERSTRIKE)
    ANALOG_BUTTONS = 0x1B0C,
    EXTENDED_REPORT_RATE = 0x8061,
    BUNNY_HOPPING = 0x80E0,
    MODE_STATUS = 0x8090,
    ONBOARD_PROFILES = 0x8100,
    MOUSE_BUTTON_SPY = 0x8110,
};

struct FeatureInfo {
    uint16_t id = 0;
    uint8_t index = 0, version = 0, type = 0;
};

struct ControlInfo {
    uint16_t cid = 0, taskId = 0;
    uint8_t flags = 0, position = 0, group = 0, groupMask = 0, extraFlags = 0;
    bool isMouse() const { return flags & 0x01; }
    bool isFKey() const { return flags & 0x02; }
    bool divertable() const { return flags & 0x20; }
    bool persistentlyDivertable() const { return flags & 0x40; }
    bool rawXY() const { return extraFlags & 0x01; }
};

struct Battery {
    int percent = 0;
    bool known = true;          // false: the device did not say how full it is (percent is null)
    std::string level;
    bool charging = false, externalPower = false;
    json toJson() const { return {{"percent", known ? json(percent) : json(nullptr)}, {"level", level}, {"charging", charging}, {"external_power", externalPower}}; }
};
// torque: how hard the ratchet is to turn, on wheels that can tune it (0x2111)
struct SmartShiftState { int mode = 0, threshold = 0, defaultThreshold = 0, torque = 0, defaultTorque = 0; bool tunable = false; };
// waveforms is a bit per waveform id the device can play
struct HapticState { bool enabled = false, discrete = false; int level = 0; uint32_t waveforms = 0; };
// a button that triggers at a press force, in the device's own units
struct ForceButton { int index = 0, min = 0, max = 0, def = 0, current = 0; bool changeable = false; };
struct HiResState { bool hidppTarget = false, hires = false, invert = false; int multiplier = 1; bool hasInvert = false, hasRatchetSwitch = false; };
struct ThumbWheelState { bool diverted = false, invert = false; int nativeRes = 0, divertedRes = 0, capabilities = 0; };
struct DpiState { int dpi = 0, def = 0; std::vector<int> levels; bool stepped = false; };
// 0x2202: the sensor's five onboard DPI slots and the one in use (host mode: what the sensor gets)
struct ExtendedDpiState {
    int dpi = 0, def = 0, dpiY = 0, lod = 0, min = 100, max = 48000;
    std::vector<int> slots, lods;
    std::vector<std::array<int, 3>> ranges;   // {from, step, to}: the values the sensor takes
};
// 0x8061: the report rate on each link, as indices into {125, 250, 500, 1000, 2000, 4000, 8000} Hz
struct ReportRateState {
    int wireless = 0, wired = 0, wirelessMask = 0, wiredMask = 0;
};
// 0x1B0C: one inductive button's actuation (1..10), rapid trigger (sensitivity 1..5, on or off) and click haptics (0..5)
struct AnalogButton {
    int actuation = 5, rapidTrigger = 2, haptics = 3;
    bool rapidTriggerOn = false;
};
struct AnalogCaps {
    int buttons = 0, maxActuation = 0, maxRapidTrigger = 0, maxHaptics = 0;
};
// 0x8100: how the mouse keeps its profiles
struct OnboardInfo {
    int format = 0, profiles = 0, buttons = 0, sectors = 0, sectorSize = 0;
};
struct BacklightState {
    bool enabled = false;
    int options = 0, supported = 0, effects = 0, level = 0, dho = 0, dhi = 0, dpow = 0, numLevels = 0, currentLevel = 0, status = 0;
    int mode() const { return (options >> 3) & 0x03; }
    bool autoSupported() const { return supported & 0x08; }
    bool permManualSupported() const { return supported & 0x20; }
};
// 0x4521: a bit per key the keyboard can switch off (caps, num, scroll lock, insert, Win/Super)
struct DisableKeysState { int supported = 0, disabled = 0; };
// 0x4531: the OS layout the keyboard uses on this host, and whether it was set or detected
struct PlatformState { int platform = 0, source = 0, autoPlatform = 0; };
struct HostInfo { int index = 0; bool paired = false; int busType = 0; std::string name; };

struct Event {
    std::string kind;
    json data;
};

class Device {
  public:
    Device(Transport& t, uint8_t index) : t_(t), index_(index) {}

    bool enumerate();
    bool has(uint16_t f) const { return features_.count(f) > 0; }
    Bytes req(uint16_t feature, uint8_t fn, const Bytes& params = {}, bool noReply = false);
    const FeatureInfo* featureByIndex(uint8_t idx) const;

    uint8_t index() const { return index_; }
    Transport& transport() { return t_; }
    const std::string& name() const { return name_; }
    const std::string& friendlyName() const { return friendlyName_; }
    const std::string& kind() const { return kind_; }
    const std::string& firmware() const { return firmware_; }
    const std::string& serial() const { return serial_; }
    const std::map<uint16_t, FeatureInfo>& features() const { return features_; }
    const std::map<uint16_t, ControlInfo>& controls() const { return controls_; }

    std::optional<Battery> battery();
    std::pair<uint8_t, uint16_t> getReporting(uint16_t cid);
    void setReporting(uint16_t cid, std::optional<bool> divert, std::optional<bool> rawXY, uint16_t remap = 0);
    std::optional<SmartShiftState> smartshift();
    void setSmartshift(int mode, int threshold, int torque = 0);
    std::optional<HapticState> haptic();
    void setHaptic(bool enabled, int level);
    void playHaptic(int waveform);
    std::vector<ForceButton> forceButtons();
    void setForce(int index, int value);
    std::optional<HiResState> hires();
    void setHires(bool hidppTarget, bool hires, bool invert);
    std::optional<ThumbWheelState> thumbwheel();
    void setThumbwheel(bool diverted, bool invert);
    std::optional<DpiState> dpi();
    void setDpi(int dpi);
    std::optional<ExtendedDpiState> extendedDpi();
    void setExtendedDpi(int dpi, int lod = 0);
    void setExtendedDpi(int x, int y, int lod);
    std::optional<int> surfaceMode();   // 0x8090: 0 automatic, 1 gaming surface, 2 any surface
    void setSurfaceMode(int mode);
    std::optional<OnboardInfo> onboardInfo();
    int onboardProfile();               // the sector of the onboard profile in use
    void setOnboardProfile(int sector);
    Bytes readSector(int sector, int size);
    void writeSector(int sector, const Bytes& data);
    uint16_t sectorCrc(int sector);   // the CRC the mouse works out over a sector it holds
    static uint16_t crcCcitt(const Bytes& b, size_t n);
    std::optional<ReportRateState> reportRate();
    void setReportRate(int index);   // the link the device is on
    std::optional<AnalogCaps> analogCaps();
    std::optional<AnalogButton> analogButton(int button);
    void setAnalogButton(int button, const AnalogButton& b);
    void setAnalogMonitoring(bool buttonEvents, int timeoutSec);
    std::optional<int> onboardMode();
    void setOnboardMode(int mode);
    std::optional<int> bunnyHopTimeout();
    void setBunnyHopTimeout(int t);
    int spyButtonCount();
    Bytes spyButtonMap();
    void setSpyButtonMap(const Bytes& map);
    void spy(bool on);
    static const char* reportRateName(int index);
    std::optional<std::pair<uint16_t, std::string>> deviceInfo();
    std::optional<BacklightState> backlight();
    void setBacklight(bool enabled, std::optional<int> mode, std::optional<int> level,
                      std::optional<int> dho = std::nullopt, std::optional<int> dhi = std::nullopt, std::optional<int> dpow = std::nullopt);
    void setHostName(int host, const std::string& name);
    std::vector<HostInfo> hosts();
    std::pair<int, int> currentHost();
    void changeHost(int host);
    uint8_t fnHost();
    void invalidateFnHost() { fnHost_ = -1; }
    std::optional<bool> fnInversion();
    void setFnInversion(bool on);
    std::optional<DisableKeysState> disableKeys();
    void setDisabledKeys(int mask);
    std::optional<PlatformState> platform();
    void setPlatform(int platform);

    std::optional<Event> classify(const Notification& n) const;
    static Battery decodeBattery(const Bytes& r);
    static Battery decodeBatteryStatus(const Bytes& r);

  private:
    int fnHost_ = -1;
    void readIdentity();
    void readFirmware();
    void readControls();
    void synthesizeControls();   // a mouse without 0x1B04 (0x8110 button spy): its buttons as controls
    bool loadCache();   // the tables of a device seen before (same serial and firmware)
    void saveCache();

    Transport& t_;
    uint8_t index_;
    std::map<uint16_t, FeatureInfo> features_;
    std::map<uint16_t, ControlInfo> controls_;
    std::string name_, friendlyName_, kind_ = "unknown", firmware_, serial_;
};

}  // namespace hidpp
