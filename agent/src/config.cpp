#include "config.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>

#include "platform/platform.h"
#include "tables.gen.h"

const json& controlLabels() {
    static const json j = json::parse(kControlLabelsJson);
    return j;
}
const json& cidNames() {
    static const json j = json::parse(kCidNamesJson);
    return j;
}

std::string Config::key(uint16_t pid) {
    char b[8];
    snprintf(b, sizeof(b), "%04x", pid);
    return b;
}

// A new install starts with a filled action ring instead of eight empty slots, clockwise from the top.
static json defaultRing() {
    auto slot = [](const char* a, const char* label, const char* icon) { return json{{"action", a}, {"label", label}, {"icon", icon}}; };
    json slots = json::array({
        slot("overview", "Activities / Overview", "fa-table-cells-large"),
        slot("volume_dial", "Volume (drag to set)", "fa-volume-high"),
        slot("play_pause", "Play / Pause", "fa-play"),
        slot("screenshot_area", "Screenshot area", "fa-crop-simple"),
        slot("show_desktop", "Show desktop", "fa-desktop"),
        slot("emoji_picker", "Emoji picker", "fa-face-smile"),
        slot("lock", "Lock screen", "fa-lock"),
        slot("calculator", "Calculator", "fa-calculator"),
    });
    return {{"profiles", json::array({{{"id", "p0"}, {"name", "Default"}, {"slots", slots}}})}, {"active", 0}};
}

Config::Config() {
    path_ = platform::configDir() + "/config.json";
    data_ = {{"devices", json::object()}, {"general", {{"desktop", "gnome"}}}};
    load();
}

void Config::load() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    std::ifstream f(platform::fsPath(path_));
    if (f) {
        try {
            json j = json::parse(f);
            if (j.is_object()) data_ = j;
        } catch (...) {
        }
    }
    if (!data_.is_object()) data_ = json::object();
    if (!data_.contains("devices") || !data_["devices"].is_object()) data_["devices"] = json::object();
    if (!data_.contains("general") || !data_["general"].is_object()) data_["general"] = {{"desktop", "gnome"}};
    if (!data_["general"].contains("ring")) data_["general"]["ring"] = defaultRing();
    for (auto it = data_["devices"].begin(); it != data_["devices"].end();) {
        json& d = it.value();
        bool ok = d.is_object() && d.value("settings", json::object()).is_object() && d.value("profiles", json::object()).is_object();
        if (!ok) it = data_["devices"].erase(it); else ++it;
    }
}

void Config::save() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    std::error_code ec;
    std::filesystem::create_directories(platform::fsPath(path_.substr(0, path_.rfind('/'))), ec);
    std::string tmp = path_ + ".tmp";
    {
        std::ofstream o(platform::fsPath(tmp));
        o << data_.dump(2) << "\n";
    }
    std::filesystem::rename(platform::fsPath(tmp), platform::fsPath(path_), ec);   // replaces the old file on every OS, unlike std::rename on Windows
}

json Config::defaultSettings(uint16_t pid) {
    static const json defaults = json::parse(kDefaultsJson);
    const std::string k = key(pid);
    return defaults.contains(k) && defaults[k].contains("settings") ? defaults[k]["settings"] : json::object();
}

json& Config::device(uint16_t pid, const std::string& kind) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    std::string k = key(pid);
    json& devs = data_["devices"];
    if (!devs.contains(k)) {
        static const json defaults = json::parse(kDefaultsJson);
        if (defaults.contains(k)) {
            devs[k] = defaults[k];
        } else if (kind == "keyboard") {
            devs[k] = {{"settings", json::object()}, {"profiles", {{"default", {{"name", "All applications"}, {"keys", json::object()}}}}}};
        } else {
            devs[k] = {{"settings", json::object()}, {"profiles", {{"default", {{"name", "All applications"}, {"buttons", json::object()}, {"thumbwheel", "native"}}}}}};
        }
        save();
    }
    return devs[k];
}

void Config::setSetting(uint16_t pid, const std::vector<std::string>& path, const json& value) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json* d = &device(pid, "")["settings"];
    for (size_t i = 0; i + 1 < path.size(); ++i) {
        if (!d->contains(path[i]) || !(*d)[path[i]].is_object()) (*d)[path[i]] = json::object();
        d = &(*d)[path[i]];
    }
    (*d)[path.back()] = value;
    save();
}

void Config::setAssignment(uint16_t pid, const std::string& profile, const std::string& section, const std::string& control, const json& action) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json& profs = device(pid, "")["profiles"];
    if (!profs.contains(profile)) profs[profile] = {{"name", profile}};
    if (section == "thumbwheel") profs[profile]["thumbwheel"] = action;
    else profs[profile][section][control] = action;
    save();
}

std::pair<std::string, json> Config::profileFor(uint16_t pid, const std::string& appClass) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json& profs = device(pid, "")["profiles"];
    if (!appClass.empty()) {
        std::string lc = appClass;
        std::transform(lc.begin(), lc.end(), lc.begin(), ::tolower);
        for (auto& [name, p] : profs.items()) {
            if (name == "default" || !p.contains("match")) continue;
            for (auto& m : p["match"]) {
                std::string ms = m.get<std::string>();
                std::transform(ms.begin(), ms.end(), ms.begin(), ::tolower);
                if (!ms.empty() && lc.find(ms) != std::string::npos) return {name, p};
            }
        }
    }
    return {"default", profs.value("default", json::object())};
}

std::string Config::backupDir() const { return path_.substr(0, path_.rfind('/')) + "/backups"; }

std::string Config::backup(const std::string& note) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    std::ifstream in(platform::fsPath(path_), std::ios::binary);
    if (!in) return "";
    std::string dir = backupDir();
    std::error_code ec;
    std::filesystem::create_directories(platform::fsPath(dir), ec);
    std::time_t t = std::time(nullptr);
    char stamp[32];
    std::strftime(stamp, sizeof(stamp), "%Y%m%d-%H%M%S", std::localtime(&t));
    // two backups in the same second (Reset every device makes one per device) each keep their own file
    std::string file = dir + "/config-" + stamp + ".json";
    // (named so they sort after the first: the newest are kept and listed first)
    for (int n = 2; std::filesystem::exists(platform::fsPath(file), ec); ++n) {
        char seq[16];
        std::snprintf(seq, sizeof(seq), "_%02d", n);
        file = dir + "/config-" + stamp + seq + ".json";
    }
    { std::ofstream out(platform::fsPath(file), std::ios::binary); out << in.rdbuf(); }
    json idx = json::object();
    { std::ifstream f(platform::fsPath(dir + "/index.json")); if (f) { try { idx = json::parse(f); } catch (...) {} } }
    if (!idx.is_object()) idx = json::object();
    idx[file.substr(dir.size() + 1)] = {{"note", note}, {"time", static_cast<long>(t)}};
    // keep the newest 15
    std::vector<std::string> names;
    for (auto& [k, v] : idx.items()) names.push_back(k);
    std::sort(names.begin(), names.end());
    while (names.size() > 15) { std::filesystem::remove(platform::fsPath(dir + "/" + names.front()), ec); idx.erase(names.front()); names.erase(names.begin()); }
    { std::ofstream f(platform::fsPath(dir + "/index.json")); f << idx.dump(2); }
    return file;
}

json Config::listBackups() {
    std::lock_guard<std::recursive_mutex> lk(m_);
    json out = json::array();
    std::string dir = backupDir();
    json idx = json::object();
    { std::ifstream f(platform::fsPath(dir + "/index.json")); if (f) { try { idx = json::parse(f); } catch (...) {} } }
    std::vector<std::string> names;
    for (auto& [k, v] : idx.items()) names.push_back(k);
    std::sort(names.rbegin(), names.rend());
    for (auto& n : names) {
        std::time_t t = idx[n].value("time", 0L);
        char when[48];
        std::strftime(when, sizeof(when), "%b %e, %H:%M", std::localtime(&t));
        out.push_back({{"file", n}, {"when", when}, {"note", idx[n].value("note", "")}, {"time", static_cast<long>(t)}});
    }
    return out;
}

bool Config::restoreBackup(const std::string& file) {
    std::lock_guard<std::recursive_mutex> lk(m_);
    if (file.find('/') != std::string::npos || file.find('\\') != std::string::npos || file.find("..") != std::string::npos) return false;
    std::ifstream in(platform::fsPath(backupDir() + "/" + file));
    if (!in) return false;
    json j;
    try { j = json::parse(in); } catch (...) { return false; }
    if (!j.is_object()) return false;
    backup("Before restore");
    data_ = j;
    if (!data_.contains("devices") || !data_["devices"].is_object()) data_["devices"] = json::object();
    if (!data_.contains("general") || !data_["general"].is_object()) data_["general"] = json::object();
    save();
    return true;
}
