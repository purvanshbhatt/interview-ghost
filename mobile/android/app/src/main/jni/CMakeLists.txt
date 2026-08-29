cmake_minimum_required(VERSION 3.13)
project(appmodules)

if(NOT DEFINED REACT_ANDROID_DIR)
    set(REACT_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native/ReactAndroid)
endif()
if(NOT DEFINED REACT_COMMON_DIR)
    set(REACT_COMMON_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native/ReactCommon)
endif()

find_package(hermes-engine REQUIRED CONFIG)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

target_sources(appmodules PRIVATE
    ${REACT_ANDROID_DIR}/src/main/jni/react/runtime/hermes/jni/JHermesInstance.cpp
    ${REACT_COMMON_DIR}/react/runtime/hermes/HermesInstance.cpp
    ${REACT_COMMON_DIR}/hermes/inspector-modern/chrome/HermesRuntimeTargetDelegate.cpp
    ${REACT_COMMON_DIR}/hermes/inspector-modern/chrome/HermesRuntimeAgentDelegate.cpp
    ${REACT_COMMON_DIR}/hermes/inspector-modern/chrome/ConnectionDemux.cpp
    ${REACT_COMMON_DIR}/hermes/inspector-modern/chrome/Registration.cpp
    ${REACT_COMMON_DIR}/react/config/ReactNativeConfig.cpp
)

target_include_directories(appmodules PUBLIC
    ${REACT_ANDROID_DIR}/src/main/jni
    ${REACT_ANDROID_DIR}/src/main/jni/react/mapbuffer
    ${REACT_ANDROID_DIR}/src/main/jni/react/runtime/jni
    ${REACT_ANDROID_DIR}/src/main/jni/react/fabric
    ${REACT_ANDROID_DIR}/src/main/jni/react/devsupport
    ${REACT_ANDROID_DIR}/src/main/jni/react/newarchdefaults
    ${REACT_ANDROID_DIR}/src/main/jni/react/turbomodule/ReactCommon
    ${REACT_ANDROID_DIR}/src/main/jni/react/uimanager
    ${REACT_ANDROID_DIR}/src/main/jni/react/reactnativeblob
    ${REACT_COMMON_DIR}
    ${REACT_COMMON_DIR}/react/runtime/hermes
    ${REACT_COMMON_DIR}/hermes/inspector-modern
    ${REACT_COMMON_DIR}/jsinspector-modern
    ${REACT_COMMON_DIR}/jsiexecutor
    ${REACT_COMMON_DIR}/callinvoker
    ${REACT_COMMON_DIR}/runtimeexecutor
    ${REACT_COMMON_DIR}/jsi
)

target_link_libraries(appmodules
    hermes-engine::libhermes
)
