// A device over HID++: reading its feature table, name and firmware, the per-serial cache that spares
// a reconnect most of that, and how each setting the app shows is decoded and written.
#include <filesystem>

#include "doctest/doctest.h"
#include "fake_hidpp.h"
#include "tmpdirs.h"

using namespace hidpp;

// an MX Master 4 as the tests see it: name, firmware and serial, plus whatever the test adds
static std::vector<fake::Feature> mouse(std::vector<fake::Feature> extra = {}, uint16_t build = 0x0003) {
    std::vector<fake::Feature> f = {fake::nameFeature("MX Master 4", 3), fake::firmwareFeature("RBM", 0x22, 0x00, build, "5A3C7F21")};
    f.insert(f.end(), extra.begin(), extra.end());
    return f;
}

struct Rig {
    fake::Device* dev;
    std::unique_ptr<Transport> t;
    std::unique_ptr<Device> d;
    explicit Rig(std::vector<fake::Feature> features) {
        auto fd = std::make_unique<fake::Device>(std::move(features));
        dev = fd.get();
        t = std::make_unique<Transport>(std::move(fd), nullptr, 1.0);
        d = std::make_unique<Device>(*t, 0xFF);
    }
};

TEST_CASE("enumerate reads the feature table, name, kind, firmware and serial") {
    testdirs::fresh();
    Rig r(mouse());
    REQUIRE(r.d->enumerate());
    CHECK(r.d->has(DEVICE_NAME));
    CHECK(r.d->has(DEVICE_FW));
    CHECK_FALSE(r.d->has(HIRES_WHEEL));
    CHECK(r.d->name() == "MX Master 4");
    CHECK(r.d->kind() == "mouse");
    CHECK(r.d->firmware() == "RBM 22.00.B0003");
    CHECK(r.d->serial() == "5A3C7F21");
}

TEST_CASE("a device seen before is not read again, unless its firmware changed") {
    testdirs::fresh();
    Rig first(mouse());
    REQUIRE(first.d->enumerate());
    const size_t full = first.dev->written.size();

    Rig again(mouse());
    REQUIRE(again.d->enumerate());
    CHECK(again.dev->written.size() < full);   // the table, name and controls come from the cache
    CHECK(again.d->name() == "MX Master 4");
    CHECK(again.d->features().size() == first.d->features().size());

    Rig updated(mouse({}, 0x0004));   // new firmware: everything is read again
    REQUIRE(updated.d->enumerate());
    CHECK(updated.dev->written.size() == full);
    CHECK(updated.d->firmware() == "RBM 22.00.B0004");
}

TEST_CASE("a device that does not answer as HID++ 2.0 is not enumerated") {
    testdirs::fresh();
    auto fd = std::make_unique<fake::Device>(std::vector<fake::Feature>{});
    fd->silent = true;
    Transport t(std::move(fd), nullptr, 0.1);
    Device d(t, 0xFF);
    CHECK_FALSE(d.enumerate());
}

TEST_CASE("battery: Unified Battery (0x1004) and Battery Status (0x1000)") {
    Battery b = Device::decodeBattery({65, 4, 0, 0});
    CHECK(b.percent == 65);
    CHECK(b.level == "good");
    CHECK_FALSE(b.charging);
    b = Device::decodeBattery({90, 8, 1, 1});
    CHECK(b.charging);
    CHECK(b.externalPower);

    b = Device::decodeBatteryStatus({0, 0, 1});   // the original MX Keys says 0% while charging
    CHECK_FALSE(b.known);
    CHECK(b.charging);
    b = Device::decodeBatteryStatus({40, 0, 3});   // full on the charger
    CHECK(b.percent == 100);
    CHECK(b.level == "full");
    b = Device::decodeBatteryStatus({15, 0, 0});
    CHECK(b.level == "low");
}

TEST_CASE("SmartShift (0x2111): mode, threshold and what can be tuned; setting writes all three") {
    testdirs::fresh();
    Bytes lastSet;
    fake::Feature ss{SMART_SHIFT_ENHANCED, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{0x01, 14, 50}};   // tunable, default threshold 14, default torque 50
                         if (fn == 1) return {{2, 255, 60}};     // ratchet, threshold 255 (never free-spins), torque 60
                         lastSet = Bytes(p.begin(), p.begin() + 3);
                         return {{}};
                     }};
    Rig r(mouse({ss}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->smartshift();
    REQUIRE(s);
    CHECK(s->mode == 2);
    CHECK(s->threshold == 255);
    CHECK(s->tunable);
    CHECK(s->defaultThreshold == 14);
    CHECK(s->torque == 60);
    r.d->setSmartshift(2, 20, 0);
    CHECK(lastSet == Bytes{2, 20, 0});
}

TEST_CASE("high-resolution wheel (0x2121): mode bits and capabilities") {
    testdirs::fresh();
    uint8_t mode = 0x06;   // high resolution, inverted
    fake::Feature hr{HIRES_WHEEL, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{15, 0x0C}};   // multiplier 15, can invert, has a ratchet switch
                         if (fn == 1) return {{mode}};
                         mode = p[0];
                         return {{mode}};
                     }};
    Rig r(mouse({hr}));
    REQUIRE(r.d->enumerate());
    auto h = r.d->hires();
    REQUIRE(h);
    CHECK(h->hires);
    CHECK(h->invert);
    CHECK_FALSE(h->hidppTarget);
    CHECK(h->multiplier == 15);
    CHECK(h->hasInvert);
    CHECK(h->hasRatchetSwitch);
    r.d->setHires(true, false, false);
    CHECK(mode == 0x01);
}

TEST_CASE("DPI (0x2201): current, default and a stepped range") {
    testdirs::fresh();
    fake::Feature dpi{ADJUSTABLE_DPI, 0, 0, [](uint8_t fn, const Bytes&) -> fake::Reply {
                          if (fn == 2) return {{0, 0x03, 0xE8, 0x03, 0xE8}};        // 1000, default 1000
                          return {{0, 0x00, 0xC8, 0xE0, 0x32, 0x1F, 0x40, 0, 0}};   // 200, step 50, 8000
                      }};
    Rig r(mouse({dpi}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->dpi();
    REQUIRE(s);
    CHECK(s->dpi == 1000);
    CHECK(s->def == 1000);
    CHECK(s->stepped);
    CHECK(s->levels == std::vector<int>{200, 8000, 50});
}

TEST_CASE("Easy-Switch (0x1814): switching sends the host and expects no reply; the current host or one out of range is refused") {
    testdirs::fresh();
    std::vector<int> switched;
    fake::Feature ch{CHANGE_HOST, 0, 0, [&](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{3, 0}};   // three hosts, on the first
                         switched.push_back(p[0]);
                         return {{}};
                     }};
    Rig r(mouse({ch}));
    REQUIRE(r.d->enumerate());
    r.d->changeHost(1);
    // the switch is sent without waiting for a reply: give the fake a moment to see it
    for (int i = 0; i < 50 && switched.empty(); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    CHECK(switched == std::vector<int>{1});
    r.d->changeHost(0);   // already there: nothing sent
    CHECK(switched.size() == 1);
    CHECK_THROWS(r.d->changeHost(3));
}

TEST_CASE("a feature the device lacks is an error, not a crash") {
    testdirs::fresh();
    Rig r(mouse());
    REQUIRE(r.d->enumerate());
    CHECK_FALSE(r.d->hires());
    CHECK_FALSE(r.d->smartshift());
    CHECK_THROWS_AS(r.d->req(SMART_SHIFT, 0), HidppError);
}

// ---------------------------------------------------------------- a G-series gaming mouse (PRO X3 SUPERSTRIKE)
// replies as read from the real mouse over its LIGHTSPEED receiver
static fake::Feature extendedDpi(std::vector<Bytes>* written = nullptr) {
    return {EXTENDED_DPI, 0, 0, [written](uint8_t fn, const Bytes& p) -> fake::Reply {
                if (fn == 2) {   // the step table, as a byte stream over pages of 13 bytes
                    static const Bytes stream = {0x00, 0x64, 0xE0, 0x01, 0x00, 0xC8, 0xE0, 0x02, 0x01, 0xF4, 0xE0, 0x05, 0x03, 0xE8, 0xE0, 0x0A, 0x07, 0xD0,
                        0xE0, 0x14, 0x13, 0x88, 0xE0, 0x32, 0x27, 0x10, 0xE0, 0x64, 0x4E, 0x20, 0xE0, 0x7D, 0x7D, 0x00, 0xE0, 0xC8, 0xBB, 0x80, 0x00, 0x00};
                    Bytes r = {0, p.size() > 1 ? p[1] : uint8_t(0), p.size() > 2 ? p[2] : uint8_t(0)};
                    size_t from = (p.size() > 2 ? p[2] : 0) * 13u;
                    for (size_t i = from; i < from + 13; ++i) r.push_back(i < stream.size() ? stream[i] : 0);
                    return {r};
                }
                if (fn == 3) return {{0, 0, 0x03, 0x20, 0x04, 0xB0, 0x06, 0x40, 0x09, 0x60, 0x0C, 0x80}};   // 800 1200 1600 2400 3200
                if (fn == 4) return {{0, 2, 2, 2, 2, 2}};
                if (fn == 5) return {{0, 0x03, 0x20, 0x03, 0x20, 0x03, 0x20, 0x03, 0x20, 2}};
                if (fn == 6) {
                    if (written) written->push_back(p);
                    return {p};
                }
                return fake::Reply::err(0x05);
            }};
}

TEST_CASE("Extended DPI (0x2202): five slots, the sensor's value, and the step table across pages") {
    testdirs::fresh();
    std::vector<Bytes> sets;
    Rig r(mouse({extendedDpi(&sets)}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->extendedDpi();
    REQUIRE(s);
    CHECK(s->dpi == 800);
    CHECK(s->slots == std::vector<int>{800, 1200, 1600, 2400, 3200});
    CHECK(s->lod == 2);
    REQUIRE(s->ranges.size() == 9);
    CHECK(s->ranges[3] == std::array<int, 3>{1000, 10, 2000});   // 0x03 | 0xE8 split over two pages
    CHECK(s->min == 100);
    CHECK(s->max == 48000);
    r.d->setExtendedDpi(1200);
    REQUIRE(sets.size() == 1);
    CHECK(Bytes(sets[0].begin(), sets[0].begin() + 6) == Bytes{0, 0x04, 0xB0, 0x04, 0xB0, 2});   // X and Y alike, the lift-off distance kept
}

TEST_CASE("Report rate (0x8061): the offered rates per link, the one in use, and a set sends only the index") {
    testdirs::fresh();
    Bytes lastSet;
    fake::Feature rr{EXTENDED_REPORT_RATE, 0, 0, [&lastSet](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 0) return {{0x00, static_cast<uint8_t>(p[0] ? 0x0F : 0x7F)}};
                         if (fn == 2) return {{static_cast<uint8_t>(p[0] ? 3 : 6)}};
                         if (fn == 3) {
                             lastSet = p;
                             return {{}};
                         }
                         return fake::Reply::err(0x05);
                     }};
    Rig r(mouse({rr}));
    REQUIRE(r.d->enumerate());
    auto s = r.d->reportRate();
    REQUIRE(s);
    CHECK(s->wireless == 3);   // 1000 Hz
    CHECK(s->wired == 6);      // 8000 Hz
    CHECK(s->wirelessMask == 0x0F);
    CHECK(std::string(Device::reportRateName(s->wired)) == "8000");
    r.d->setReportRate(4);
    CHECK(lastSet.size() >= 1);
    CHECK(lastSet[0] == 4);
}

TEST_CASE("HITS (0x1B0C): each value is its step times 4, the rapid trigger's switch in bit 0") {
    testdirs::fresh();
    std::vector<Bytes> sets;
    fake::Feature hits{ANALOG_BUTTONS, 1, 0, [&sets](uint8_t fn, const Bytes& p) -> fake::Reply {
                           if (fn == 0) return {{0x00, 0x03, 0x28, 0x14, 0x14, 0x01}};
                           if (fn == 2) return {{p[0], 0x08, 0x0D, 0x0C}};   // G HUB's "Kscerato" left button
                           if (fn == 1) {
                               sets.push_back(p);
                               return {p};
                           }
                           return fake::Reply::err(0x05);
                       }};
    Rig r(mouse({hits}));
    REQUIRE(r.d->enumerate());
    auto c = r.d->analogCaps();
    REQUIRE(c);
    CHECK(c->maxActuation == 10);
    CHECK(c->maxRapidTrigger == 5);
    auto b = r.d->analogButton(0);
    REQUIRE(b);
    CHECK(b->actuation == 2);
    CHECK(b->rapidTrigger == 3);
    CHECK(b->rapidTriggerOn);
    CHECK(b->haptics == 3);
    AnalogButton w;
    w.actuation = 3;
    w.rapidTrigger = 2;
    w.rapidTriggerOn = true;
    w.haptics = 1;
    r.d->setAnalogButton(1, w);
    REQUIRE(sets.size() == 1);
    CHECK(Bytes(sets[0].begin(), sets[0].begin() + 4) == Bytes{1, 0x0C, 0x09, 0x04});
}

TEST_CASE("a mouse without 0x1B04 gets its buttons from the button spy (0x8110), and spy events are button events") {
    testdirs::fresh();
    fake::Feature spy{MOUSE_BUTTON_SPY, 0, 0, [](uint8_t fn, const Bytes&) -> fake::Reply {
                          if (fn == 0) return {{5}};
                          if (fn == 3) return {{1, 2, 3, 4, 5, 0, 0, 0}};
                          return {{}};
                      }};
    Rig r(mouse({spy}));
    REQUIRE(r.d->enumerate());
    REQUIRE(r.d->controls().size() == 5);
    CHECK(r.d->controls().count(0x50));
    CHECK(r.d->controls().count(0x56));
    CHECK(r.d->controls().at(0x53).position == 4);
    CHECK(r.d->controls().at(0x53).divertable());
    CHECK(r.d->spyButtonMap() == Bytes{1, 2, 3, 4, 5});
    Notification n;
    n.deviceIndex = 0xFF;
    n.featureIndex = r.dev->indexOf(MOUSE_BUTTON_SPY);
    n.event = 0;
    n.data = {0x00, 0x18};   // buttons 4 and 5
    auto ev = r.d->classify(n);
    REQUIRE(ev);
    CHECK(ev->kind == "buttons");
    CHECK(ev->data["down"] == json::array({0x53, 0x56}));
}

TEST_CASE("bunny hopping (0x80E0): the timeout in 10 ms steps") {
    testdirs::fresh();
    Bytes last;
    fake::Feature bh{BUNNY_HOPPING, 0, 0, [&last](uint8_t fn, const Bytes& p) -> fake::Reply {
                         if (fn == 1) return {{0x0A}};
                         if (fn == 2) {
                             last = p;
                             return {p};
                         }
                         return {{0}};
                     }};
    Rig r(mouse({bh}));
    REQUIRE(r.d->enumerate());
    CHECK(r.d->bunnyHopTimeout() == 10);
    r.d->setBunnyHopTimeout(30);
    CHECK(last.at(0) == 30);
}

TEST_CASE("device info (0x0003 v4+): the model id and unit id, for a receiver without pairing registers") {
    testdirs::fresh();
    Rig r(mouse());
    REQUIRE(r.d->enumerate());
    // the test firmware feature answers fn0 with a one-byte entity count: too short for device info
    CHECK_FALSE(r.d->deviceInfo());
}

TEST_CASE("Easy-Switch names: a name cut inside a character loses the broken character") {
    testdirs::fresh();
    // "Ahmed’s" with the reply for the second piece missing: the first 14 bytes end inside "’"
    const std::string full = "Ahmed\xE2\x80\x99s MacBook Pro";
    fake::Feature hosts{HOSTS_INFO, 1, 0, [full](uint8_t fn, const Bytes& p) -> fake::Reply {
                            if (fn == 0) return {{0x01, 0, 1}};
                            if (fn == 1) return {{0, 1, 1, 0, static_cast<uint8_t>(full.size())}};
                            if (fn == 3 && p[1] == 0) {
                                Bytes r = {p[0], 0};
                                for (size_t i = 0; i < 7; ++i) r.push_back(static_cast<uint8_t>(full[i]));
                                return {r};
                            }
                            return {{p[0], p[1]}};   // nothing more
                        }};
    Rig r(mouse({hosts}));
    REQUIRE(r.d->enumerate());
    auto h = r.d->hosts();
    REQUIRE(h.size() == 1);
    CHECK(h[0].name == "Ahmed");
    CHECK_NOTHROW(json(h[0].name).dump());
}

TEST_CASE("an onboard profile's settings read as NotLogi keeps them (a profile G HUB wrote)") {
    // sector 1 of a PRO X3 SUPERSTRIKE, as G HUB left it: 8000/4000 Hz, slots 1000..100, HITS left 3/3/3 right 5/3/1
    hidpp::Bytes p(255, 0xFF);
    const uint8_t head[] = {0x06, 0x05, 0x00, 0x03, 0xe8, 0x03, 0xe8, 0x03, 0x02, 0x4c, 0x04, 0x4c, 0x04, 0x02, 0x40, 0x06, 0xdc, 0x05, 0x02,
                            0xaa, 0x05, 0xaa, 0x05, 0x02, 0x64, 0x00, 0x64, 0x00, 0x02};
    std::copy(std::begin(head), std::end(head), p.begin());
    const uint8_t hits[] = {0x0c, 0x0c, 0x0c, 0x14, 0x0c, 0x04};
    std::copy(std::begin(hits), std::end(hits), p.begin() + 0x26);
    json s = hidpp::onboardProfileSettings(p);
    CHECK(s["report_rate"] == 8000);
    CHECK(s["report_rate_wired"] == 4000);
    CHECK(s["dpi_default"] == 0);
    CHECK(s["dpi_shift"] == 3);
    CHECK(s["dpi_slots"]["0"] == 1000);
    CHECK(s["dpi_slots"]["2"] == 1600);
    CHECK(s["dpi_slots_y"]["2"] == 1500);
    CHECK(s["dpi_advanced"] == true);
    CHECK(s["dpi_lod"]["4"] == 2);
    CHECK(s["dpi"] == 1000);
    CHECK(s["hits"]["left"]["actuation"] == 3);
    CHECK(s["hits"]["left"]["rapid_trigger"] == 3);
    CHECK(s["hits"]["left"]["rapid_trigger_on"] == false);
    CHECK(s["hits"]["left"]["haptics"] == 3);
    CHECK(s["hits"]["right"]["actuation"] == 5);
    CHECK(s["hits"]["right"]["haptics"] == 1);
}
