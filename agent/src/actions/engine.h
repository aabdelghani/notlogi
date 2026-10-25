// Device events -> desktop actions (gestures, adapters, keystrokes)
#pragma once
#include <atomic>
#include <condition_variable>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

#include "injector.h"
#include "nlohmann/json.hpp"

namespace actions {

using json = nlohmann::json;

// Resolve a preset name or inline action object to a full action object
json resolve(const json& action);
const json& presets();

struct DeviceOps {
    std::function<void(int)> changeHost;
    std::function<int()> getDpi;
    std::function<void(int)> setDpi;
    std::function<void()> toggleSmartshift;
    std::function<void(const std::string&)> uiEvent;
    // the action ring held on a control: kind is open, move (raw dx, dy) or release
    std::function<void(const std::string& kind, int cid, int dx, int dy)> ringEvent;
    std::function<void()> gestureFired;   // a swipe was recognised and its action ran
    // a gaming mouse: its DPI slots (up, down, cycle, default, goto_shift; shift_on and shift_off
    // while DPI shift is held), the G-Shift layer while held, the battery shown, the next onboard profile
    std::function<void(const std::string& op)> dpiOp;
    std::function<void(bool held)> gshift;
    std::function<void()> batteryLevel;
    std::function<void()> onboardCycle;
};

// Smooth scrolling, as Options+ does it (its SmoothScrollManager and ScrollController, read from
// its Windows agent): each step of the wheel is added to a target, and once per display frame a
// share of what is left is played. The share follows how fast the wheel turns: slow, deliberate
// notches glide softly (down to 1% a frame), a fast spin follows the wheel almost at once; after
// a step's first frame at most 20% a frame, and the first frame plays at most 60% of its share.
class Smoother {
  public:
    explicit Smoother(Injector& inj);
    ~Smoother();
    void add(double dy, double dx);   // 1/120 detent units, positive = up / right
    static void setFrameRate(double hz);   // the display's refresh rate (60 when not known)
    // a fast flick keeps scrolling once the wheel stops, slowing as Options+ slows it; not in
    // free-spin, where the wheel itself keeps turning
    void setMomentum(bool on) { std::lock_guard<std::mutex> lk(m_); momentum_ = on; if (!on) cy_ = cx_ = 0; }
    void setRatchet(bool on) { std::lock_guard<std::mutex> lk(m_); ratchet_ = on; }

    // one axis of the smoothing (public for the tests): what the wheel asked for, played a frame at a time
    struct Axis {
        double target = 0, pos = 0;   // what was asked for and what was played, in units
        double gain = 0, maxStep = 0;   // share of what is left played a frame, and its cap
        double lastT = 0, lastD = 0, speed = 0;   // the wheel's speed (units/ms), smoothed
        double rest = 0;   // played but under one unit, not sent yet
        double flick = 0;   // the wheel's speed over its last 100 ms (units/ms), for momentum
        void push(double d, double tms);
        double step();
    };

  private:
    void run();
    Injector& inj_;
    std::mutex m_;
    std::condition_variable cv_;
    bool stop_ = false;
    Axis y_, x_;
    bool momentum_ = false, ratchet_ = true;
    double lastInput_ = 0;   // when the wheel last turned (ms)
    double cy_ = 0, cx_ = 0;   // coasting after a flick, units a frame
    void coast();
    std::thread t_;
};

class Engine {
  public:
    Engine(Injector& inj, DeviceOps ops) : inj_(inj), ops_(std::move(ops)), smooth_(inj) {}
    void play(const json& action, double delta = 0.0);
    void buttonDown(int cid, const json& action);
    void buttonUp(int cid, const json& action);
    void rawXY(int dx, int dy);
    void thumbwheel(int rotation, const json& action, double speed = 1.0, bool smooth = false);
    // the main wheel when the agent has taken it over: 1/120 detent units, positive = up
    void wheel(double units, double speed, bool smooth);
    void setMomentum(bool on) { smooth_.setMomentum(on); }
    void setRatchet(bool on) { smooth_.setRatchet(on); }
    ~Engine();

  private:
    // a macro playing for a control: its stop flag, shared with the thread that plays it
    void startMacro(int cid, const json& macro, bool loop);
    void stopMacro(int cid);
    std::map<int, std::shared_ptr<std::atomic<bool>>> macros_;
    struct Gesture {
        json action;
        int dx = 0, dy = 0;
        bool fired = false;
        double accX = 0, accY = 0;
        char direction = 0;  // 0, 'x', 'y'
    };
    static std::string dir(int dx, int dy);
    Injector& inj_;
    DeviceOps ops_;
    std::mutex m_;
    std::map<int, Gesture> gestures_;
    std::map<int, std::vector<std::string>> held_;
    std::set<int> ringHeld_;   // controls holding the action ring open until they are released
    double wheelAcc_ = 0;
    double restY_ = 0, restX_ = 0;   // scrolled but under one unit, not sent yet (no smoothing)
    Smoother smooth_;
    void scrollBy(double dy, double dx, bool smooth);
};

}  // namespace actions
