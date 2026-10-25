// logimxctl: command line client for the agent
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "ipc.h"

using json = nlohmann::json;

static void usage() {
    printf(
        "logimxctl <command>\n"
        "  status                      agent status\n"
        "  devices                     list devices and their state\n"
        "  show <id>                   full JSON for one device\n"
        "  set <id> <path> <value>     e.g. set b034 dpi 1600 | set b034 smartshift.threshold 20 | set b378 backlight.mode manual\n"
        "  assign <id> <section> <control> <action> [profile]   e.g. assign b034 buttons 195 gesture_navigation\n"
        "  host <id> <1..3>            Easy-Switch to another host\n"
        "  presets                     list preset actions\n"
        "  config                      dump configuration\n"
        "  reload                      reload config from disk\n"
        "  hidpp <id> <feature> <fn> [hex bytes...]   one raw HID++ request, e.g. hidpp 40be 2202 5 00\n"
        "  rpc <method> [json]         any agent request, e.g. rpc onboard_profiles '{\"id\":\"40be\"}'\n");
}

static json parseValue(const std::string& v) {
    try {
        return json::parse(v);
    } catch (...) {
        return v;
    }
}

static void printDevice(const json& d) {
    std::string batt = "n/a";
    if (d.contains("battery") && d["battery"].is_object()) {
        const json& p = d["battery"]["percent"];
        batt = (p.is_number() ? std::to_string(p.get<int>()) + "%" : std::string("level unknown")) + (d["battery"].value("charging", false) ? " charging" : "");
    }
    printf("%s  [%s]  %s  fw %s  via %s  battery %s  profile %s\n", d.value("name", "").c_str(), d.value("id", "").c_str(),
           d.value("kind", "").c_str(), d.value("firmware", "").c_str(), d.value("transport", "").c_str(), batt.c_str(),
           d.value("profile", "").c_str());
    const json& st = d.value("state", json::object());
    if (st.contains("dpi")) printf("  dpi %d (range %s)\n", st["dpi"].value("dpi", 0), st["dpi"]["levels"].dump().c_str());
    if (st.contains("smartshift")) printf("  smartshift %s threshold %d\n", st["smartshift"].value("mode", "").c_str(), st["smartshift"].value("threshold", 0));
    if (st.contains("hires")) printf("  hires wheel %s invert %s\n", st["hires"].value("hires", false) ? "on" : "off", st["hires"].value("invert", false) ? "on" : "off");
    if (st.contains("thumbwheel")) printf("  thumbwheel diverted %s invert %s\n", st["thumbwheel"].value("diverted", false) ? "yes" : "no", st["thumbwheel"].value("invert", false) ? "yes" : "no");
    if (st.contains("backlight"))
        printf("  backlight %s mode %d level %d/%d\n", st["backlight"].value("enabled", false) ? "on" : "off", st["backlight"].value("mode", 0),
               st["backlight"].value("current_level", 0), st["backlight"].value("num_levels", 0));
    if (st.contains("hosts")) {
        printf("  hosts");
        int cur = st["hosts"].value("current", 0);
        for (auto& h : st["hosts"]["names"]) printf(" %s%d:%s", h.value("index", 0) == cur ? "*" : "", h.value("index", 0) + 1, h.value("name", "-").c_str());
        printf("\n");
    }
    std::string ctl;
    for (auto& c : d.value("controls", json::array()))
        if (c.value("divertable", false)) ctl += (ctl.empty() ? "" : ", ") + c.value("label", "") + (c.value("diverted", false) ? "*" : "");
    if (!ctl.empty()) printf("  controls: %s   (* = diverted)\n", ctl.c_str());
}

int main(int argc, char** argv) {
    if (argc < 2) {
        usage();
        return 0;
    }
    std::string cmd = argv[1];
    std::vector<std::string> a(argv + 2, argv + argc);
    try {
        ipc::Client c;
        if (cmd == "status") printf("%s\n", c.call("status").dump(1).c_str());
        else if (cmd == "devices") { json devs = c.call("devices"); for (auto& d : devs) printDevice(d); }
        else if (cmd == "show" && a.size() == 1) printf("%s\n", c.call("device", {{"id", a[0]}}).dump(1).c_str());
        else if (cmd == "set" && a.size() == 3) {
            std::vector<std::string> path;
            size_t s = 0, e;
            while ((e = a[1].find('.', s)) != std::string::npos) { path.push_back(a[1].substr(s, e - s)); s = e + 1; }
            path.push_back(a[1].substr(s));
            printf("%s\n", c.call("set_setting", {{"id", a[0]}, {"path", path}, {"value", parseValue(a[2])}}).dump(1).c_str());
        } else if (cmd == "rpc" && !a.empty()) {
            printf("%s\n", c.call(a[0], a.size() > 1 ? json::parse(a[1]) : json::object()).dump(1).c_str());
        } else if (cmd == "hidpp" && a.size() >= 3) {
            json params = json::array();
            for (size_t i = 3; i < a.size(); ++i) params.push_back(a[i]);
            json r = c.call("hidpp", {{"id", a[0]}, {"feature", a[1]}, {"fn", std::stoi(a[2])}, {"params", params}});
            if (r.contains("error")) printf("ERROR 0x%02X\n", r["error"].get<int>());
            else {
                for (auto& b : r["reply"]) printf("%s ", b.get<std::string>().c_str());
                printf("\n");
            }
        } else if (cmd == "assign" && a.size() >= 4) {
            json d = c.call("set_assignment", {{"id", a[0]}, {"section", a[1]}, {"control", a[2]}, {"action", parseValue(a[3])}, {"profile", a.size() > 4 ? a[4] : "default"}});
            printDevice(d);
        } else if (cmd == "host" && a.size() == 2) c.call("change_host", {{"id", a[0]}, {"host", std::stoi(a[1]) - 1}});
        else if (cmd == "presets") {
            json all = c.call("presets")["all"];   // held: iterating into the temporary would outlive it
            for (auto& [k, v] : all.items()) printf("%-22s %s\n", k.c_str(), v.value("label", "").c_str());
        }
        else if (cmd == "config") printf("%s\n", c.call("config").dump(1).c_str());
        else if (cmd == "reload") c.call("reload");
        else { usage(); return 2; }
    } catch (const std::exception& e) {
        fprintf(stderr, "error: %s\n", e.what());
        return 1;
    }
    return 0;
}
