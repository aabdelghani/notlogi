#include "engine.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdlib>

#include "../tables.gen.h"
#include "../platform/platform.h"
#include "presets_os.h"

namespace actions {

const json& presets() {
    static const json p = [] {
        json j = json::parse(kPresetsJson);
        applyOsPresets(j);
        return j;
    }();
    return p;
}

json resolve(const json& action) {
    if (action.is_string()) {
        const json& all = presets()["all"];
        auto it = all.find(action.get<std::string>());
        json a = it == all.end() ? all["native"] : *it;
        a["preset"] = action;
        return a;
    }
    if (action.is_object()) return action;
    return presets()["all"]["native"];
}

static std::vector<std::string> keys(const json& a, const char* field = "keys") {
    std::vector<std::string> out;
    if (a.contains(field) && a[field].is_array())
        for (auto& k : a[field]) out.push_back(k.get<std::string>());
    return out;
}

void Engine::play(const json& action, double delta) {
    std::string t = action.value("type", "native");
    if (t == "native" || t == "nothing") return;
    if (t == "keystroke") {
        inj_.tap(keys(action));
    } else if (t == "button") {
        inj_.click(action.value("button", "BTN_MIDDLE"), action.value("count", 1));
    } else if (t == "scroll") {
        int amt = static_cast<int>(delta != 0.0 ? delta : action.value("amount", 0.0));
        auto mods = keys(action, "modifiers");
        if (!mods.empty()) inj_.press(mods);
        if (action.value("axis", "y") == "x") inj_.scroll(0, amt);
        else inj_.scroll(amt, 0);
        if (!mods.empty()) inj_.release(mods);
    } else if (t == "command") {
        platform::runCommand(action.value("cmd", ""));
    } else if (t == "ui") {
        if (ops_.uiEvent) ops_.uiEvent(action.value("event", "emoji"));
    } else if (t == "type_text") {
        inj_.typeText(action.value("text", ""));
    } else if (t == "open") {
        platform::openTarget(action.value("target", ""));
    } else if (t == "launch") {
        platform::launchApp(action.value("app", ""));
    } else if (t == "smartshift_toggle") {
        if (ops_.toggleSmartshift) ops_.toggleSmartshift();
    } else if (t == "change_host") {
        if (ops_.changeHost) ops_.changeHost(action.value("host", 0));
    } else if (t == "dpi_cycle") {
        if (ops_.getDpi && ops_.setDpi) {
            int cur = ops_.getDpi();
            std::vector<int> levels = action.contains("levels") ? action["levels"].get<std::vector<int>>() : std::vector<int>{800, 1000, 1600, 2400, 4000};
            int nxt = levels.front();
            for (int lv : levels)
                if (lv > cur) { nxt = lv; break; }
            ops_.setDpi(nxt);
        }
    } else if (t == "dpi") {
        if (ops_.dpiOp && action.value("op", "") != "shift") ops_.dpiOp(action.value("op", "cycle"));
    } else if (t == "macro") {
        startMacro(-1, action, false);
    } else if (t == "battery_level") {
        if (ops_.batteryLevel) ops_.batteryLevel();
    } else if (t == "onboard_cycle") {
        if (ops_.onboardCycle) ops_.onboardCycle();
    }
}

// A macro's steps, played on their own thread: each a key or mouse button going down or up after its
// delay (ms). Looping, it starts again until stopped; stopped, whatever it holds goes up.
void Engine::startMacro(int cid, const json& macro, bool loop) {
    auto stop = std::make_shared<std::atomic<bool>>(false);
    {
        std::lock_guard<std::mutex> lk(m_);
        auto it = macros_.find(cid);
        if (it != macros_.end()) it->second->store(true);   // a press while it plays starts it over
        if (cid >= 0) macros_[cid] = stop;
    }
    json steps = macro.value("steps", json::array());
    if (!steps.is_array() || steps.empty()) return;
    // the injector, not the engine: the device (and its engine) may go while a macro still plays
    std::thread([&inj = inj_, steps, loop, stop] {
        std::set<std::string> down;
        auto wait = [&](int ms) {
            for (int left = ms; left > 0 && !stop->load(); left -= 10) std::this_thread::sleep_for(std::chrono::milliseconds(std::min(10, left)));
        };
        do {
            for (auto& st : steps) {
                if (stop->load()) break;
                wait(std::max(0, std::min(10000, st.value("delay", 0))));
                if (stop->load()) break;
                std::string k = st.value("key", "");
                if (k.empty()) continue;
                if (st.value("down", true)) { inj.press({k}); down.insert(k); }
                else { inj.release({k}); down.erase(k); }
            }
            // a loop with no pause of its own still lets other input through between rounds
            if (loop && !stop->load()) wait(15);
        } while (loop && !stop->load());
        if (!down.empty()) inj.release(std::vector<std::string>(down.begin(), down.end()));
        stop->store(true);
    }).detach();
}

void Engine::stopMacro(int cid) {
    std::lock_guard<std::mutex> lk(m_);
    auto it = macros_.find(cid);
    if (it == macros_.end()) return;
    it->second->store(true);
    macros_.erase(it);
}

Engine::~Engine() {
    std::lock_guard<std::mutex> lk(m_);
    for (auto& [cid, stop] : macros_) stop->store(true);
}

std::string Engine::dir(int dx, int dy) {
    if (std::abs(dx) >= std::abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
}

static bool isRing(const json& a) { return a.value("type", "") == "ui" && a.value("event", "") == "ring"; }

void Engine::buttonDown(int cid, const json& action) {
    json a = resolve(action);
    std::string t = a.value("type", "native");
    // The ring opens on the press and picks on the release, like a gesture button: hold, move to a
    // slot, let go. Every other action waits for the release so a gesture can still be told apart.
    if (isRing(a)) {
        ringHeld_.insert(cid);
        if (ops_.ringEvent) ops_.ringEvent("open", cid, 0, 0);
        else if (ops_.uiEvent) ops_.uiEvent("ring");
        return;
    }
    // DPI shift and G-Shift last as long as the button is held
    if (t == "dpi" && a.value("op", "") == "shift") {
        if (ops_.dpiOp) ops_.dpiOp("shift_on");
        return;
    }
    if (t == "gshift") {
        if (ops_.gshift) ops_.gshift(true);
        return;
    }
    // a macro starts with the press: once, over and over while held, or on and off with each press
    if (t == "macro") {
        std::string rep = a.value("repeat", "once");
        bool running;
        {
            std::lock_guard<std::mutex> lk(m_);
            auto it = macros_.find(cid);
            running = it != macros_.end() && !it->second->load();
        }
        if (rep == "toggle" && running) stopMacro(cid);
        else startMacro(cid, a, rep != "once");
        return;
    }
    if (t == "gesture") {
        std::lock_guard<std::mutex> lk(m_);
        gestures_[cid] = Gesture{a};
    } else if (t == "hold") {
        auto k = keys(a);
        inj_.press(k);
        held_[cid] = k;
    }
}

void Engine::buttonUp(int cid, const json& action) {
    json a = resolve(action);
    std::string t = a.value("type", "native");
    if (ringHeld_.erase(cid) || isRing(a)) {
        if (ops_.ringEvent) ops_.ringEvent("release", cid, 0, 0);
        else if (ops_.uiEvent) ops_.uiEvent("ring_release");
        return;
    }
    if (t == "dpi" && a.value("op", "") == "shift") {
        if (ops_.dpiOp) ops_.dpiOp("shift_off");
        return;
    }
    if (t == "gshift") {
        if (ops_.gshift) ops_.gshift(false);
        return;
    }
    if (t == "macro") {
        if (a.value("repeat", "once") == "while_held") stopMacro(cid);
        return;
    }
    if (t == "gesture") {
        Gesture g;
        {
            std::lock_guard<std::mutex> lk(m_);
            auto it = gestures_.find(cid);
            if (it == gestures_.end()) return;
            g = it->second;
            gestures_.erase(it);
        }
        int thr = a.value("threshold", 60);
        bool moved = std::abs(g.dx) > thr || std::abs(g.dy) > thr;
        if (a.value("continuous", false)) {
            if (!g.direction) play(a.value("click", json::object()));
        } else if (!g.fired && !moved) {
            play(a.value("click", json::object()));
        } else if (!g.fired && moved) {
            play(a.value(dir(g.dx, g.dy), json::object()));
            if (ops_.gestureFired) ops_.gestureFired();
        }
    } else if (t == "hold") {
        auto it = held_.find(cid);
        if (it != held_.end()) {
            inj_.release(it->second);
            held_.erase(it);
        }
    } else {
        play(a);
    }
}

void Engine::rawXY(int dx, int dy) {
    // while the ring is held the mouse steers it: the pointer stays where it was and the raw
    // movement goes to the ring instead of any gesture
    if (!ringHeld_.empty()) {
        if (ops_.ringEvent) ops_.ringEvent("move", *ringHeld_.begin(), dx, dy);
        return;
    }
    std::lock_guard<std::mutex> lk(m_);
    for (auto& [cid, g] : gestures_) {
        g.dx += dx;
        g.dy += dy;
        const json& a = g.action;
        int thr = a.value("threshold", 60);
        if (a.value("continuous", false)) {
            int step = std::max(1, a.value("step", 40));
            if (!g.direction) {
                if (std::abs(g.dx) > thr || std::abs(g.dy) > thr) {
                    g.direction = std::abs(g.dx) >= std::abs(g.dy) ? 'x' : 'y';
                    g.accX = g.accY = 0;
                } else {
                    continue;
                }
            }
            if (g.direction == 'x') {
                g.accX += dx;
                while (std::abs(g.accX) >= step) {
                    int sign = g.accX > 0 ? 1 : -1;
                    g.accX -= sign * step;
                    const json& sub = a.value(sign > 0 ? "right" : "left", json::object());
                    play(sub, sub.value("amount", 0.0));
                }
            } else {
                g.accY += dy;
                while (std::abs(g.accY) >= step) {
                    int sign = g.accY > 0 ? 1 : -1;
                    g.accY -= sign * step;
                    const json& sub = a.value(sign > 0 ? "down" : "up", json::object());
                    play(sub, sub.value("amount", 0.0));
                }
            }
        } else if (!g.fired && (std::abs(g.dx) > thr || std::abs(g.dy) > thr)) {
            g.fired = true;
            play(a.value(dir(g.dx, g.dy), json::object()));
            if (ops_.gestureFired) ops_.gestureFired();
        }
    }
}

void Engine::thumbwheel(int rotation, const json& action, double speed, bool smooth) {
    json a = resolve(action);
    std::string t = a.value("type", "native");
    if (rotation == 0 || t == "native" || t == "nothing") return;
    if (t == "scroll") {
        double amt = rotation * a.value("gain", 8.0) * speed;
        auto mods = keys(a, "modifiers");
        bool x = a.value("axis", "x") == "x";
        if (mods.empty()) { scrollBy(x ? 0 : -amt, x ? amt : 0, smooth); return; }
        // with keys held (zoom) the scroll goes out at once, while they are down
        inj_.press(mods);
        if (x) inj_.scroll(0, static_cast<int>(amt));
        else inj_.scroll(-static_cast<int>(amt), 0);
        inj_.release(mods);
    } else if (t == "adapter") {
        int step = std::max(1, a.value("step", 120));
        wheelAcc_ += rotation * a.value("gain", 8.0);
        while (std::abs(wheelAcc_) >= step) {
            int sign = wheelAcc_ > 0 ? 1 : -1;
            wheelAcc_ -= sign * step;
            play(a.value(sign > 0 ? "plus" : "minus", json::object()));
        }
    } else {
        play(a);
    }
}

void Engine::wheel(double units, double speed, bool smooth) { scrollBy(units * speed, 0, smooth); }

void Engine::scrollBy(double dy, double dx, bool smooth) {
    if (smooth) { smooth_.add(dy, dx); return; }
    restY_ += dy; restX_ += dx;
    int y = static_cast<int>(restY_), x = static_cast<int>(restX_);
    restY_ -= y; restX_ -= x;
    if (y || x) inj_.scroll(y, x);
}

// Options+'s default smoothing profile: the speeds (units/ms) between which the share grows from
// its least to all, the share's least and its cap after the first frame, the first frame's cap,
// and how speeds under the slowest are read (a lone notch counts as a moderate speed)
namespace {
constexpr double SLOW = 120.0 / 2000, FAST = 120.0 / 10, LEAST = 0.01, LATER = 0.2, FIRST = 0.6, SLOW_RATIO = 4, SLOW_POW = 2;
constexpr double SLOPE = (1.0 - LEAST) / (FAST - SLOW), BASE = LEAST - SLOPE * SLOW;
std::atomic<double> gFrameMs{1000.0 / 60};
double nowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
double readSpeed(double s) {
    double a = std::abs(s);
    if (a >= SLOW) return a;
    double r = SLOW / std::max(SLOW / SLOW_RATIO, a);
    return SLOW * std::pow(r, SLOW_POW);
}
}  // namespace

void Smoother::setFrameRate(double hz) { if (hz >= 24 && hz <= 500) gFrameMs = 1000.0 / hz; }

void Smoother::Axis::push(double d, double t) {
    // the wheel's speed: this step against the last, blended with the speed so far (more weight to
    // this one the longer it has been); turning the other way starts afresh
    double inst = 0;
    bool fresh = lastT == 0 || t - lastT > 1000 || (lastD != 0 && (d > 0) != (lastD > 0));
    if (!fresh) inst = d / std::max(t - lastT, 1.0);
    double eff = readSpeed(inst);
    if (fresh) speed = eff;
    else {
        double w = std::max(t - lastT, 8.0) / 1000.0 + 0.3;
        speed = (eff * w + std::max(-1.0, std::min(1.0, speed))) / (w + 1);
    }
    // the speed over about the last 100 ms (a notch's fine steps come in a burst, so one notch on
    // its own stays slow): what a coast starts from
    flick = (fresh ? 0 : flick * std::exp(-(t - lastT) / 100.0)) + std::abs(d) / 100.0;
    lastT = t; lastD = d;
    gain = std::max(LEAST, std::min(1.0, SLOPE * std::abs(speed) + BASE));
    target += d;
    maxStep = (target - pos) * gain * FIRST;
}

double Smoother::Axis::step() {
    double s = (target - pos) * gain;
    if ((s > 0 && maxStep > 0 && s > maxStep) || (s < 0 && maxStep < 0 && s < maxStep)) s = maxStep;
    gain = std::min(gain, LATER);
    pos += s;
    if (std::abs(s) < 0.04) { pos = target; return 0; }   // what is left is too little to show
    return s;
}

Smoother::Smoother(Injector& inj) : inj_(inj), t_([this] { run(); }) {}

Smoother::~Smoother() {
    { std::lock_guard<std::mutex> lk(m_); stop_ = true; }
    cv_.notify_all();
    if (t_.joinable()) t_.join();
}

void Smoother::add(double dy, double dx) {
    {
        std::lock_guard<std::mutex> lk(m_);
        double t = nowMs();
        if (dy) y_.push(dy, t);
        if (dx) x_.push(dx, t);
        cy_ = cx_ = 0;   // the wheel turning again stops a coast
        lastInput_ = t;
    }
    cv_.notify_all();
}

// Momentum, as Options+ slows a flick (its smoothing thread): each frame the speed keeps 97%,
// then a friction that grows as it slows (v * |v| / (|v| + 0.1), in Options+'s units: 1.83 units
// a frame), and it stops at 0.04. A coast starts when the wheel has been still for 40 ms after
// turning faster than about 17 notches a second (over its last 100 ms).
namespace {
constexpr double OPT_UNIT = 100.0 * 0.016 / 105.0 * 120.0, FLICK = 2.0, STILL_MS = 40;
}
void Smoother::coast() {
    const double frame = gFrameMs.load();
    auto start = [&](Axis& a, double& c) {
        if (a.flick >= FLICK && a.target == a.pos) { c = (a.lastD > 0 ? 1 : -1) * a.flick * frame; a.flick = 0; }
    };
    if (momentum_ && ratchet_ && nowMs() - lastInput_ > STILL_MS) { start(y_, cy_); start(x_, cx_); }
    auto slow = [&](double& c, Axis& a) {
        if (!c) return;
        a.rest += c;
        double v = c / OPT_UNIT * std::pow(0.97, frame / (1000.0 / 60));
        v = std::abs(v) / (std::abs(v) + 0.1) * v;
        c = std::abs(v) <= 0.04 ? 0 : v * OPT_UNIT;
    };
    slow(cy_, y_); slow(cx_, x_);
}

void Smoother::run() {
    std::unique_lock<std::mutex> lk(m_);
    auto busy = [this] { return y_.target != y_.pos || x_.target != x_.pos || cy_ || cx_ || (momentum_ && (y_.flick >= FLICK || x_.flick >= FLICK)); };
    while (!stop_) {
        cv_.wait(lk, [&] { return stop_ || busy(); });
        if (stop_) break;
        // one step a display frame, as Options+ plays it in time with the screen
        auto next = std::chrono::steady_clock::now();
        while (!stop_ && busy()) {
            y_.rest += y_.step(); x_.rest += x_.step();
            coast();
            if (!momentum_ || !ratchet_) y_.flick = x_.flick = 0;
            int y = static_cast<int>(y_.rest), x = static_cast<int>(x_.rest);
            y_.rest -= y; x_.rest -= x;
            lk.unlock();
            if (y || x) inj_.scroll(y, x);
            next += std::chrono::microseconds(static_cast<long long>(gFrameMs.load() * 1000));
            std::this_thread::sleep_until(next);
            lk.lock();
        }
    }
}

}  // namespace actions
