#include "motion.h"

#include <cmath>
#include <stdexcept>

#ifdef __linux__
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>

#include <filesystem>
#include <fstream>
#endif

using json = nlohmann::json;

// A report descriptor walked for the X and Y of the Generic Desktop page: where each sits in its
// report (bits after the report id), how wide it is. Report ids, sizes and counts are global items;
// usages local ones, used up by each Input.
std::vector<MotionCounter::Layout> MotionCounter::parse(const std::vector<uint8_t>& d) {
    std::map<int, Layout> byId;
    std::map<int, int> offset;
    int page = 0, size = 0, count = 0, id = -1;
    std::vector<uint32_t> usages;
    uint32_t umin = 0, umax = 0;
    for (size_t i = 0; i < d.size();) {
        uint8_t b = d[i];
        if (b == 0xFE) {   // a long item: skip it
            if (i + 1 >= d.size()) break;
            i += 3 + d[i + 1];
            continue;
        }
        int n = b & 3;
        if (n == 3) n = 4;
        uint32_t v = 0;
        for (int k = 0; k < n && i + 1 + k < d.size(); ++k) v |= static_cast<uint32_t>(d[i + 1 + k]) << (8 * k);
        int type = (b >> 2) & 3, tag = b >> 4;
        i += 1 + n;
        if (type == 1) {   // global
            if (tag == 0) page = static_cast<int>(v);
            else if (tag == 7) size = static_cast<int>(v);
            else if (tag == 8) id = static_cast<int>(v);
            else if (tag == 9) count = static_cast<int>(v);
        } else if (type == 2) {   // local
            if (tag == 0) usages.push_back(n == 4 ? v : (static_cast<uint32_t>(page) << 16 | v));
            else if (tag == 1) umin = n == 4 ? v : (static_cast<uint32_t>(page) << 16 | v);
            else if (tag == 2) umax = n == 4 ? v : (static_cast<uint32_t>(page) << 16 | v);
        } else if (type == 0) {   // main
            if (tag == 8) {   // Input: count fields of size bits, each the next usage (the last one repeats)
                int& off = offset[id];
                for (int f = 0; f < count; ++f) {
                    uint32_t u = 0;
                    if (!usages.empty()) u = usages[std::min<size_t>(f, usages.size() - 1)];
                    else if (umax >= umin && umin) u = std::min(umin + static_cast<uint32_t>(f), umax);
                    Layout& l = byId[id];
                    l.reportId = id;
                    if (u == 0x10030 && l.xOff < 0) { l.xOff = off; l.xBits = size; }
                    if (u == 0x10031 && l.yOff < 0) { l.yOff = off; l.yBits = size; }
                    off += size;
                }
            } else if (tag == 9 || tag == 11) {   // Output, Feature: not in the input report
            }
            usages.clear();
            umin = umax = 0;
        }
    }
    std::vector<Layout> out;
    for (auto& [k, l] : byId)
        if (l.xOff >= 0 && l.yOff >= 0) out.push_back(l);
    return out;
}

static int field(const uint8_t* r, int len, int off, int bits) {
    long long v = 0;
    for (int b = 0; b < bits; ++b) {
        int at = off + b;
        if (at / 8 >= len) return 0;
        if (r[at / 8] & (1 << (at % 8))) v |= 1LL << b;
    }
    if (bits < 64 && (v & (1LL << (bits - 1)))) v -= 1LL << bits;   // signed, as movement is
    return static_cast<int>(v);
}

#ifdef __linux__
namespace fs = std::filesystem;

// the hidraw nodes on the same USB device as this one (the receiver or the mouse on its cable)
static std::vector<std::string> siblings(const std::string& node) {
    std::string name = fs::path(node).filename();
    fs::path dev = fs::canonical("/sys/class/hidraw/" + name + "/device");
    // .../usbN/3-4/3-4:1.2/0003:046D:C54F.0007: up two to the USB device
    fs::path usb = dev.parent_path().parent_path();
    std::vector<std::string> out;
    for (auto& e : fs::directory_iterator("/sys/class/hidraw")) {
        std::error_code ec;
        fs::path p = fs::canonical(e.path() / "device", ec);
        if (!ec && p.string().rfind(usb.string() + "/", 0) == 0) out.push_back(e.path().filename());
    }
    return out;
}

void MotionCounter::start(const std::map<std::string, std::string>& nodes) {
    stop();
    std::vector<Source> srcs;
    for (auto& [id, node] : nodes) {
        bool found = false;
        for (auto& h : siblings(node)) {
            std::ifstream f("/sys/class/hidraw/" + h + "/device/report_descriptor", std::ios::binary);
            std::vector<uint8_t> desc((std::istreambuf_iterator<char>(f)), {});
            auto layouts = parse(desc);
            if (layouts.empty()) continue;
            int fd = ::open(("/dev/" + h).c_str(), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
            if (fd < 0) continue;
            srcs.push_back({id, fd, layouts});
            found = true;
        }
        if (!found) {
            for (auto& s : srcs) ::close(s.fd);
            throw std::runtime_error("no mouse reports readable for " + id);
        }
    }
    {
        std::lock_guard<std::mutex> lk(m_);
        sources_ = std::move(srcs);
        counts_.clear();
        for (auto& [id, n] : nodes) counts_[id] = Count{};
    }
    running_ = true;
    thread_ = std::thread([this] { loop(); });
}

void MotionCounter::loop() {
    std::vector<pollfd> pf;
    for (auto& s : sources_) pf.push_back({s.fd, POLLIN, 0});
    uint8_t buf[64];
    while (running_) {
        if (::poll(pf.data(), pf.size(), 100) <= 0) continue;
        for (size_t i = 0; i < pf.size(); ++i) {
            if (!(pf[i].revents & POLLIN)) continue;
            ssize_t n;
            while ((n = ::read(pf[i].fd, buf, sizeof(buf))) > 0) {
                for (auto& l : sources_[i].layouts) {
                    const uint8_t* r = buf;
                    int len = static_cast<int>(n);
                    if (l.reportId >= 0) {
                        if (buf[0] != l.reportId) continue;
                        ++r;
                        --len;
                    }
                    int dx = field(r, len, l.xOff, l.xBits), dy = field(r, len, l.yOff, l.yBits);
                    std::lock_guard<std::mutex> lk(m_);
                    Count& c = counts_[sources_[i].id];
                    c.x += dx;
                    c.y += dy;
                    c.dist += std::hypot(dx, dy);
                }
            }
        }
    }
}

void MotionCounter::stop() {
    running_ = false;
    if (thread_.joinable()) thread_.join();
    std::lock_guard<std::mutex> lk(m_);
    for (auto& s : sources_) ::close(s.fd);
    sources_.clear();
}
#else
void MotionCounter::start(const std::map<std::string, std::string>&) { throw std::runtime_error("counting a mouse's movement is not available on this system yet"); }
void MotionCounter::loop() {}
void MotionCounter::stop() { running_ = false; }
#endif

json MotionCounter::read() {
    std::lock_guard<std::mutex> lk(m_);
    json out = json::object();
    for (auto& [id, c] : counts_) out[id] = {{"dist", std::lround(c.dist)}, {"x", c.x}, {"y", c.y}};
    return out;
}
