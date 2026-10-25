#include "discovery.h"

#include "hid.h"

namespace hidpp {

std::vector<Node> scan() {
    std::vector<Node> out;
    for (auto& n : hidEnumerate()) out.push_back(Node{n.path, n.info.name, n.info.vendor, n.info.product, n.info.bustype});
    return out;
}

std::vector<Node> usable(const std::vector<Node>& nodes) {
    std::vector<Node> out;
    for (auto& n : nodes)
        if (n.isReceiver() || n.isBluetooth() || n.isWiredMouse()) out.push_back(n);
    return out;
}

}  // namespace hidpp
