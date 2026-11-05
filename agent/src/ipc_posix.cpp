// Unix socket stream (Linux, macOS)
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#include <cerrno>
#include <cstring>
#include <filesystem>
#include <stdexcept>

#include "ipc.h"

namespace ipc {

namespace {

#ifdef MSG_NOSIGNAL
constexpr int kSendFlags = MSG_NOSIGNAL;
#else
constexpr int kSendFlags = 0;   // macOS: SO_NOSIGPIPE on the socket instead
#endif

void prepare(int fd) {
    fcntl(fd, F_SETFD, FD_CLOEXEC);
#ifdef SO_NOSIGPIPE
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one));
#endif
}

class SocketConn : public Conn {
  public:
    explicit SocketConn(int fd) : fd_(fd) {}
    ~SocketConn() override { ::close(fd_); }
    int recv(char* buf, size_t len) override { return static_cast<int>(::recv(fd_, buf, len, 0)); }
    bool send(const std::string& s) override {
        std::lock_guard<std::mutex> lk(m_);
        size_t off = 0;
        while (off < s.size()) {
            ssize_t w = ::send(fd_, s.data() + off, s.size() - off, kSendFlags);
            if (w <= 0) return false;
            off += static_cast<size_t>(w);
        }
        return true;
    }
    void close() override { ::shutdown(fd_, SHUT_RDWR); }

  private:
    int fd_;
    std::mutex m_;
};

sockaddr_un address(const std::string& path) {
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    if (path.size() >= sizeof(addr.sun_path)) throw std::runtime_error("socket path too long: " + path);
    strncpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path) - 1);
    return addr;
}

class SocketListener : public Listener {
  public:
    explicit SocketListener(const std::string& path) : path_(path) {
        std::error_code ec;
        std::filesystem::create_directories(std::filesystem::path(path).parent_path(), ec);
        ::unlink(path_.c_str());
        fd_ = ::socket(AF_UNIX, SOCK_STREAM, 0);
        if (fd_ < 0) throw std::runtime_error("socket");
        prepare(fd_);
        sockaddr_un addr = address(path_);
        if (::bind(fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) throw std::runtime_error("bind " + path_ + ": " + strerror(errno));
        chmod(path_.c_str(), 0600);
        ::listen(fd_, 64);
        struct stat st{};
        if (::stat(path_.c_str(), &st) == 0) { ino_ = st.st_ino; dev_ = st.st_dev; }
    }
    // the path is removed only while it is still this socket: an agent that took the place of this
    // one (an upgrade, a developer's build) has its own there by now
    ~SocketListener() override {
        ::shutdown(fd_, SHUT_RDWR);
        ::close(fd_);
        struct stat st{};
        if (::stat(path_.c_str(), &st) == 0 && st.st_ino == ino_ && st.st_dev == dev_) ::unlink(path_.c_str());
    }
    std::shared_ptr<Conn> accept(int timeoutMs) override {
        pollfd p{fd_, POLLIN, 0};
        if (::poll(&p, 1, timeoutMs) <= 0) return nullptr;
        int c = ::accept(fd_, nullptr, nullptr);
        if (c < 0) return nullptr;
        prepare(c);
        int fl = fcntl(c, F_GETFL);
        if (fl >= 0) fcntl(c, F_SETFL, fl & ~O_NONBLOCK);
        return std::make_shared<SocketConn>(c);
    }

  private:
    std::string path_;
    ino_t ino_ = 0;
    dev_t dev_ = 0;
    int fd_ = -1;
};

}  // namespace

std::unique_ptr<Listener> Listener::create(const std::string& path) { return std::make_unique<SocketListener>(path); }

std::shared_ptr<Conn> connect(const std::string& path) {
    int fd = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) throw std::runtime_error("socket");
    prepare(fd);
    sockaddr_un addr = address(path);
    if (::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd);
        throw std::runtime_error("agent not running (" + path + ")");
    }
    return std::make_shared<SocketConn>(fd);
}

}  // namespace ipc
