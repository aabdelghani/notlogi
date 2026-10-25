// Where X and Y sit in a mouse report, read from the report descriptors of the receivers here
#include <string>

#include "doctest/doctest.h"
#include "motion.h"

static std::vector<uint8_t> hex(const char* s) {
    std::vector<uint8_t> out;
    for (size_t i = 0; s[i] && s[i + 1]; i += 2) out.push_back(static_cast<uint8_t>(std::stoi(std::string(s + i, 2), nullptr, 16)));
    return out;
}

TEST_CASE("PRO X3 SUPERSTRIKE's LIGHTSPEED receiver: no report id, 16 buttons then X and Y of 16 bits") {
    auto l = MotionCounter::parse(hex("05010902a1010901a100951075011500250105091901291081029502751016008026ff7f0501093009318106950175081580257f09388106050c0a38028106c095057508150026ff000600ff09f18100c0"));
    REQUIRE(l.size() == 1);
    CHECK(l[0].reportId == -1);
    CHECK(l[0].xOff == 16);
    CHECK(l[0].xBits == 16);
    CHECK(l[0].yOff == 32);
    CHECK(l[0].yBits == 16);
}

TEST_CASE("Bolt receiver's mouse interface: report 2, the same layout after the id") {
    auto l = MotionCounter::parse(hex("05010902a10185020901a100951075011500250105091901291081029502751016018026ff7f0501093009318106950175081581257f093881069501050c0a38028106c0c0050c0901a101850395027510150126ff0219012aff028100c0"));
    REQUIRE(l.size() == 1);
    CHECK(l[0].reportId == 2);
    CHECK(l[0].xOff == 16);
    CHECK(l[0].yOff == 32);
}

TEST_CASE("a keyboard or the HID++ interface has no X and Y") {
    CHECK(MotionCounter::parse(hex("05010906a1019508750115002501050719e029e7810281039505050819012905910295017503910395067508150026ff00050719002aff008100c0")).empty());
    CHECK(MotionCounter::parse(hex("0643ff0a0103a101851095067508150026ff000901810009019100c0")).empty());
}

#include "hidpp/protocol.h"

TEST_CASE("onboard memory: a sector ends with its CRC-CCITT, as the PRO X3 SUPERSTRIKE's directory does") {
    // its directory as read: five profiles in sectors 1..5, the first switched on, then 0xFF to the CRC
    hidpp::Bytes dir(255, 0xFF);
    const uint8_t head[] = {0x00, 0x01, 0x01, 0xFF, 0x00, 0x02, 0x00, 0xFF, 0x00, 0x03, 0x00, 0xFF, 0x00, 0x04, 0x00, 0xFF, 0x00, 0x05, 0x00, 0xFF};
    std::copy(std::begin(head), std::end(head), dir.begin());
    CHECK(hidpp::Device::crcCcitt(dir, 253) == 0x4037);
}
