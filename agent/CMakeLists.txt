cmake_minimum_required(VERSION 3.16)
project(logimx-agent VERSION 0.14.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(APPLE)
  set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "")
endif()

# HID backend: hidraw on Linux, hidapi on Windows and macOS. LOGIMX_HID=hidapi on Linux builds
# the hidapi path against hidraw, which is how that code is tested without a Windows machine.
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  set(LOGIMX_HID "hidraw" CACHE STRING "HID backend: hidraw or hidapi")
else()
  set(LOGIMX_HID "hidapi")
endif()

find_package(Threads REQUIRED)

set(CORE_SOURCES
  src/hidpp/transport.cpp
  src/hidpp/protocol.cpp
  src/hidpp/discovery.cpp
  src/actions/injector_common.cpp
  src/actions/engine.cpp
  src/config.cpp
  src/ipc.cpp
  src/platform/steam.cpp
  src/motion.cpp)

if(WIN32)
  list(APPEND CORE_SOURCES
    src/platform/win.cpp
    src/ipc_win.cpp
    src/actions/injector_win.cpp
    src/apps/tracker_win.cpp src/apps/recorder_win.cpp)
elseif(APPLE)
  enable_language(OBJCXX)
  list(APPEND CORE_SOURCES
    src/platform/mac.mm
    src/ipc_posix.cpp
    src/actions/injector_mac.mm
    src/apps/tracker_mac.mm src/apps/recorder_mac.cpp)
else()
  find_package(X11 REQUIRED)
  list(APPEND CORE_SOURCES
    src/platform/linux.cpp
    src/ipc_posix.cpp
    src/actions/injector_linux.cpp
    src/apps/tracker_linux.cpp src/apps/recorder_linux.cpp)
endif()

if(LOGIMX_HID STREQUAL "hidapi")
  set(HIDAPI third_party/hidapi)
  if(WIN32)
    add_library(hidapi STATIC ${HIDAPI}/windows/hid.c)  # hid.c includes hidapi_descriptor_reconstruct.c itself
    target_include_directories(hidapi PUBLIC ${HIDAPI}/hidapi ${HIDAPI}/windows)
  elseif(APPLE)
    add_library(hidapi STATIC ${HIDAPI}/mac/hid.c)
    target_include_directories(hidapi PUBLIC ${HIDAPI}/hidapi ${HIDAPI}/mac)
    target_link_libraries(hidapi PUBLIC "-framework IOKit" "-framework CoreFoundation" "-framework AppKit")
  else()
    add_library(hidapi STATIC ${HIDAPI}/linux/hid.c)
    target_include_directories(hidapi PUBLIC ${HIDAPI}/hidapi)
    target_link_libraries(hidapi PUBLIC udev)
  endif()
  list(APPEND CORE_SOURCES src/hidpp/hid_hidapi.cpp)
else()
  list(APPEND CORE_SOURCES src/hidpp/hid_linux.cpp)
endif()

add_library(oo_core STATIC ${CORE_SOURCES})
target_include_directories(oo_core PUBLIC src third_party)
target_link_libraries(oo_core PUBLIC Threads::Threads)
if(LOGIMX_HID STREQUAL "hidapi")
  target_link_libraries(oo_core PUBLIC hidapi)
endif()

if(WIN32)
  target_compile_definitions(oo_core PUBLIC WIN32_LEAN_AND_MEAN NOMINMAX UNICODE _UNICODE _WIN32_WINNT=0x0A00)
  target_link_libraries(oo_core PUBLIC setupapi cfgmgr32 hid advapi32 ole32 oleaut32 uuid shell32 user32 psapi)
elseif(APPLE)
  target_link_libraries(oo_core PUBLIC "-framework ApplicationServices" "-framework AppKit" "-framework Carbon" "-framework CoreAudio" "-framework IOKit" "-framework CoreFoundation" "-framework SystemConfiguration")
  target_compile_options(oo_core PRIVATE $<$<COMPILE_LANGUAGE:OBJCXX>:-fobjc-arc>)
else()
  target_link_libraries(oo_core PUBLIC X11::X11)
endif()

if(MSVC)
  set(WARN /W3 /wd4100 /wd4244 /wd4267 /utf-8)
else()
  set(WARN -Wall -Wextra -Wno-unused-parameter)
endif()
target_compile_options(oo_core PRIVATE ${WARN})

add_executable(logimx-agent src/daemon.cpp src/main.cpp)

# macOS: the app's Input Monitoring request (a Node-API module Electron loads, see the source)
if(APPLE)
  add_library(input_monitoring MODULE src/platform/mac_input_monitoring.c)
  set_target_properties(input_monitoring PROPERTIES PREFIX "" SUFFIX ".node")
  target_link_libraries(input_monitoring PRIVATE "-framework IOKit" "-undefined dynamic_lookup")
endif()
target_link_libraries(logimx-agent PRIVATE oo_core)
target_compile_options(logimx-agent PRIVATE ${WARN})

add_executable(logimxctl src/ctl.cpp)
target_link_libraries(logimxctl PRIVATE oo_core)

if(MINGW)
  # one self-contained exe: no libstdc++ / libgcc DLLs to ship beside it
  target_link_options(logimx-agent PRIVATE -static)
  target_link_options(logimxctl PRIVATE -static)
endif()

# Tests (doctest, run with ctest): the HID++ transport and devices against a scripted device, the
# settings file, and the scroll smoothing. Not built when cross-compiling, where they could not run.
include(CTest)
if(BUILD_TESTING AND NOT CMAKE_CROSSCOMPILING)
  add_executable(agent_tests tests/main.cpp tests/hidpp_test.cpp tests/device_test.cpp tests/config_test.cpp tests/smoother_test.cpp tests/motion_test.cpp)
  target_include_directories(agent_tests PRIVATE tests)
  target_link_libraries(agent_tests PRIVATE oo_core)
  target_compile_options(agent_tests PRIVATE ${WARN})
  add_test(NAME agent_tests COMMAND agent_tests)
endif()

install(TARGETS logimx-agent logimxctl RUNTIME DESTINATION bin)
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  install(FILES ${CMAKE_SOURCE_DIR}/../udev/60-logimx.rules DESTINATION /usr/lib/udev/rules.d OPTIONAL)
endif()
