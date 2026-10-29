// The agent: owns transports and devices, applies configuration, routes events
#pragma once
#include <atomic>
#include <chrono>
#include <vector>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>

#include "actions/engine.h"
#include "actions/injector.h"
#include "apps/tracker.h"
#include "apps/recorder.h"
#include "config.h"
#include "hidpp/discovery.h"
#include "hidpp/protocol.h"
#include "hidpp/transport.h"
#include "ipc.h"
#include "motion.h"

class Daemon;

class ManagedDevice : public std::enable_shared_from_this<ManagedDevice> {
  public:
    ManagedDevice(Daemon& d, hidpp::Transport& t, std::unique_ptr<hidpp::Device> dev, uint16_t pid, std::string serial);
    std::string id() const { return Config::key(pid_); }
    uint16_t pid() const { return pid_; }
    hidpp::Device& dev() { return *dev_; }
    hidpp::Transport& transport() { return t_; }
    json summary();
    // run one action through this device's engine (its host switching, DPI and SmartShift ops)
    void play(const json& a) { engine_->play(a); }
    // haptic feedback for something the user just did (ring_hover, ring_run, gesture); false when
    // the device has no haptics or the setting for that kind of cue is off
    bool cue(const std::string& name);
    json batteryJson() const;
    std::string transportName() const;
    json readState(bool full = true);
    void applySettings(const std::string& only = "");
    void applyAssignments();
    // an app profile of this device matches this window class
    bool hasAppProfile(const std::string& appClass);
    bool isDiverted(int cid) const { return diverted_.count(cid) > 0; }
    void releaseAll();
    void setProfile(const std::string& appClass);
    void handle(const hidpp::Event& ev);
    void reapply();
    void refreshConfig();
    void applyPointerSpeed(double v);
    const std::string& profileName() const { return profileName_; }
    std::optional<hidpp::Battery> battery() const { return battery_; }
    // The first battery answer after a link is whatever the firmware stored before it slept,
    // so it is provisional until a later read confirms it. Alerts must not fire on it.
    void setBattery(std::optional<hidpp::Battery> b, bool confirmed = true) {
        battery_ = std::move(b);
        batteryConfirmed_ = confirmed;
    }
    bool batteryConfirmed() const { return batteryConfirmed_; }
    // false while the receiver reports the device's link as down (asleep, switched off, out of range)
    bool online() const { return online_.load(); }
    void setOnline(bool on) { online_.store(on); }

    // a G-series gaming mouse: buttons through the button spy (0x8110), no 0x1B04
    bool gaming() const { return !dev_->has(hidpp::SPECIAL_KEYS) && dev_->has(hidpp::MOUSE_BUTTON_SPY); }
    // what the mouse keeps in its onboard memory, profile by profile (read on request: slow)
    json onboardProfiles();
    json withMacro(const json& action);   // a macro's steps and repeat, from the saved macros
    // the onboard memory written: NotLogi's settings into one profile (1..5), or every profile back to
    // the factory one; what was there is backed up first
    json onboardSave(int index);
    json onboardRestore();
    json onboardEnable(int index, bool on);
    json onboardDump();
    // a gaming mouse's DPI: the slot in use (or the shift slot while DPI shift is held), its X and Y,
    // lift-off distance and the sensor calibration, onto the sensor's own steps; the slots of the
    // app profile in front when it has a sensitivity of its own
    void applyDpi();
    // the HITS latency test (G HUB's): open / close (report rate held at 1000 Hz meanwhile), start
    // (the button's travel reported), blue (the moment to react from), result, stop
    json hitsTest(const std::string& op, const json& p);

  private:
    json actionFor(int cid);
    void announce(const json& action);
    void dpiOp(const std::string& op);
    int snapDpi(int dpi) const;
    bool onboardMemory() const;   // the mouse runs its own profiles; NotLogi leaves it alone
    Daemon& daemon_;
    hidpp::Transport& t_;
    std::unique_ptr<hidpp::Device> dev_;
    uint16_t pid_;
    std::string serial_, kind_;
    json cfg_, profile_;
    std::string profileName_ = "default";
    std::optional<hidpp::Battery> battery_;
    bool batteryConfirmed_ = false;
    std::atomic<bool> online_{true};
    std::set<int> down_, diverted_;
    std::set<int> rawDiverted_;   // controls whose raw XY is diverted as well (gesture assignments)
    hidpp::Bytes spyMap_;         // 0x8110: the HID button each physical button sends (empty = not read yet)
    bool spying_ = false;
    bool shiftHeld_ = false, gshiftHeld_ = false;   // DPI shift, G-Shift held down
    int appSlot_ = -1;   // the slot in use within an app profile's own sensitivity (-1: its default)
    std::map<int, json> pressed_;   // the action each held control started, so its release ends the same one
    // the HITS test: the travel events since it started, the moment the target turned blue, the
    // report rate to put back
    bool hitsTest_ = false, hitsOpen_ = false;   // a round running; the test open (travel shown live)
    int hitsButton_ = 0, hitsRate_ = -1;
    std::chrono::steady_clock::time_point hitsBlue_{};
    std::vector<std::pair<std::chrono::steady_clock::time_point, json>> hitsLog_;
    // the wheels taken over by the agent for their speed or smooth scrolling (as Options+ does)
    bool wheelTaken_ = false, wheelSmooth_ = false, wheelInvert_ = false, thumbTuned_ = false, thumbSmooth_ = false;
    double wheelSpeed_ = 1.0, thumbSpeed_ = 1.0;
    int wheelMult_ = 8;   // hi-res steps per notch
    json state_;
    json hostsCache_;
    std::string receiverFw_;   // the receiver's own firmware (read once)
    std::unique_ptr<actions::Engine> engine_;
    std::recursive_mutex m_;
};

struct PairingSession {
    hidpp::Transport* transport = nullptr;
    bool active = false, discovering = false, lockOpen = false;
    int counter = -1;
    uint8_t kind = 0, authentication = 0;
    std::vector<uint8_t> address;
    std::string name, passkey, error, doneName;
    std::chrono::steady_clock::time_point started{};
    int timeoutSec = 60;
};

class Daemon {
  public:
    Daemon();
    ~Daemon();
    int run();
    void stop() { stop_ = true; }
    Config& config() { return config_; }
    actions::Injector& injector() { return *injector_; }
    void broadcast(const std::string& ev, const json& data) { if (server_) server_->broadcast(ev, data); }
    const std::string& appClass() const { return appClass_; }
    void changeHostFrom(ManagedDevice& src, int host);
    bool paused() const { return paused_; }

  private:
    using DevPtr = std::shared_ptr<ManagedDevice>;
    void scan();
    bool attach(hidpp::Transport& t, uint8_t idx, const hidpp::Node& node);
    void onNotification(hidpp::Transport& t, const hidpp::Notification& n);
    void onApp(const std::string& cls);
    json rpc(const std::string& method, const json& p);
    void onReceiverNotification(hidpp::Transport& t, const hidpp::Notification& n);
    void pairStart();
    void pairCancel();
    void pairBroadcast(const std::string& status);
    DevPtr find(const std::string& id);
    bool linkAlive(ManagedDevice& md);
    std::vector<DevPtr> snapshot();

    Config config_;
    std::unique_ptr<actions::Injector> injector_;
    std::unique_ptr<ipc::Server> server_;
    std::unique_ptr<apps::Tracker> tracker_;
    // mapMutex_ protects the two maps only and is never held during device I/O
    std::mutex mapMutex_;
    std::map<std::string, std::unique_ptr<hidpp::Transport>> transports_;
    std::map<std::string, DevPtr> devices_;  // by id (pid hex)
    std::mutex attachMutex_;                 // guards attachLocks_
    std::map<const hidpp::Transport*, std::mutex> attachLocks_;   // attach() one at a time per link
    std::mutex scanMutex_;
    apps::Recorder recorder_;
    std::atomic<bool> pairing_{false};
    std::string appClass_;
    // the window whose app profile is in use, kept while its own dialogs and pop-ups are in front
    std::string profileApp_;
    int profilePid_ = 0;
    std::atomic<bool> stop_{false};
    std::atomic<bool> paused_{false};
    PairingSession pair_;
    MotionCounter motion_;   // HERO sensor calibration: raw movement of the mice being compared
    std::mutex pairMutex_;
    std::chrono::steady_clock::time_point lastRetry_{};
    // Flow: devices are on their way here; scan every 150 ms until then (steady clock, ms)
    std::atomic<long long> expectUntil_{0};
};
