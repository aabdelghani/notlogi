// Raw movement of mice, counted straight from their receivers' (or cables') mouse interfaces: no
// pointer acceleration, one count per step of the sensor. HERO sensor calibration moves two mice
// together and compares their counts. Linux reads hidraw; elsewhere it is not available yet.
#pragma once
#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "nlohmann/json.hpp"

class MotionCounter {
  public:
    ~MotionCounter() { stop(); }
    // count for these devices, each given by the hidraw node of its HID++ interface (the mouse
    // interface beside it is found from there); throws when one has none
    void start(const std::map<std::string, std::string>& hidppNodes);
    void stop();
    // per device: the distance moved (counts, along the path) and the X and Y sums
    nlohmann::json read();

    // the bit place of X and Y in a mouse report, from its report descriptor
    struct Layout {
        int reportId = -1;   // -1: the interface sends no report ids
        int xOff = -1, xBits = 0, yOff = -1, yBits = 0;
    };
    static std::vector<Layout> parse(const std::vector<uint8_t>& descriptor);

  private:
    struct Source {
        std::string id;
        int fd = -1;
        std::vector<Layout> layouts;
    };
    struct Count {
        double dist = 0;
        long long x = 0, y = 0;
    };
    void loop();
    std::vector<Source> sources_;
    std::map<std::string, Count> counts_;
    std::mutex m_;
    std::thread thread_;
    std::atomic<bool> running_{false};
};
