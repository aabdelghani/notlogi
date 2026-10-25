#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace hidpp {

inline const std::map<uint16_t, std::string> kReceivers = {
    {0xC548, "Bolt"}, {0xC52B, "Unifying"}, {0xC532, "Unifying"}, {0xC52F, "Nano"}, {0xC534, "Nano"},
    {0xC539, "Lightspeed"}, {0xC53A, "Lightspeed"}, {0xC53F, "Lightspeed"}, {0xC547, "Lightspeed"}, {0xC54F, "Lightspeed"}};

// gaming mice that speak HID++ over their own USB cable (device index 0xFF), by their wired product
// id; each is known by the model id it reports, the same as over its receiver
inline const std::map<uint16_t, std::string> kWiredMice = {{0xC0A9, "PRO X3 SUPERSTRIKE"}};

struct Node {
    std::string path, name;
    uint16_t vendor = 0, product = 0;
    uint32_t bustype = 0;
    bool isReceiver() const { return kReceivers.count(product) > 0; }
    bool isBluetooth() const { return bustype == 0x05; }
    bool isWiredMouse() const { return bustype == 0x03 && kWiredMice.count(product) > 0; }
    std::string receiverKind() const { auto it = kReceivers.find(product); return it == kReceivers.end() ? "" : it->second; }
};

// Logitech HID nodes (vendor 0x046D) that speak HID++ and that we can open.
std::vector<Node> scan();
// Receivers, Bluetooth devices and the gaming mice known on their cable (USB children of the dj
// driver are covered by the receiver).
std::vector<Node> usable(const std::vector<Node>& nodes);

}  // namespace hidpp
