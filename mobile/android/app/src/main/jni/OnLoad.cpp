/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the overlay directory of this source tree.
 */

#include <DefaultComponentsRegistry.h>
#include <DefaultTurboModuleManagerDelegate.h>
#include <autolinking.h>
#include <fbjni/fbjni.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <rncore.h>

#ifdef REACT_NATIVE_APP_CODEGEN_HEADER
#include REACT_NATIVE_APP_CODEGEN_HEADER
#endif
#ifdef REACT_NATIVE_APP_COMPONENT_DESCRIPTORS_HEADER
#include REACT_NATIVE_APP_COMPONENT_DESCRIPTORS_HEADER
#endif

namespace facebook::react {

void registerComponents(
    std::shared_ptr<const ComponentDescriptorProviderRegistry> registry) {
#ifdef REACT_NATIVE_APP_COMPONENT_REGISTRATION
  REACT_NATIVE_APP_COMPONENT_REGISTRATION(registry);
#endif
  autolinking_registerProviders(registry);
}

std::shared_ptr<TurboModule> cxxModuleProvider(
    const std::string& name,
    const std::shared_ptr<CallInvoker>& jsInvoker) {
#ifdef REACT_NATIVE_APP_MODULE_PROVIDER
  auto module = REACT_NATIVE_APP_MODULE_PROVIDER(name, jsInvoker);
  if (module != nullptr) {
    return module;
  }
#endif
  return nullptr;
}

std::shared_ptr<TurboModule> javaModuleProvider(
    const std::string& name,
    const JavaTurboModule::InitParams& params) {
#ifdef REACT_NATIVE_APP_MODULE_PROVIDER
  auto module = REACT_NATIVE_APP_MODULE_PROVIDER(name, params);
  if (module != nullptr) {
    return module;
  }
#endif

  if (auto module = rncore_ModuleProvider(name, params)) {
    return module;
  }

  if (auto module = autolinking_ModuleProvider(name, params)) {
    return module;
  }

  return nullptr;
}

} // namespace facebook::react

#include <react/runtime/hermes/jni/JHermesInstance.h>
#include <react/fabric/ComponentFactory.h>
#include <react/fabric/SurfaceHandlerBinding.h>
#include <react/fabric/Binding.h>
#include <react/fabric/EventBeatManager.h>
#include <react/fabric/EventEmitterWrapper.h>
#include <react/fabric/StateWrapperImpl.h>
#include <react/fabric/JEmptyReactNativeConfig.h>
#include <react/uimanager/ComponentNameResolverBinding.h>
#include <react/uimanager/UIConstantsProviderBinding.h>
#include <react/common/mapbuffer/JReadableMapBuffer.h>
#include <react/devsupport/JInspectorFlags.h>
#include <react/devsupport/JCxxInspectorPackagerConnection.h>
#include <react/runtime/jni/JReactInstance.h>
#include <react/runtime/jni/JJSTimerExecutor.h>
#include <react/runtime/jni/JReactHostInspectorTarget.h>
#include <react/turbomodule/ReactCommon/TurboModuleManager.h>
#include <react/turbomodule/ReactCommon/CompositeTurboModuleManagerDelegate.h>
#include <react/jni/WritableNativeMap.h>
#include <react/jni/ReadableNativeMap.h>
#include <react/jni/NativeMap.h>
#include <react/jni/WritableNativeArray.h>
#include <react/jni/ReadableNativeArray.h>
#include <react/jni/NativeArray.h>
#include <react/jni/CatalystInstanceImpl.h>
#include <react/jni/JReactMarker.h>
#include <react/jni/JInspector.h>
#include <react/jni/ReactInstanceManagerInspectorTarget.h>
#include <react/jni/InspectorNetworkRequestListener.h>
#include <react/jni/JCallback.h>
#include <react/jni/CxxModuleWrapperBase.h>
#include <react/jni/JDynamicNative.h>

namespace facebook::react {
class JReactNativeFeatureFlagsCxxInterop {
 public:
  static void registerNatives();
};
}

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad_Weak(JavaVM* vm, void* reserved);

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
  JNI_OnLoad_Weak(vm, reserved);

  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider =
        &facebook::react::cxxModuleProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
        &facebook::react::javaModuleProvider;
    facebook::react::DefaultComponentsRegistry::
        registerComponentDescriptorsFromEntryPoint =
            &facebook::react::registerComponents;

    facebook::react::CatalystInstanceImpl::registerNatives();
    facebook::react::ReadableNativeArray::registerNatives();
    facebook::react::WritableNativeMap::registerNatives();
    facebook::react::ComponentFactory::registerNatives();
    facebook::react::Binding::registerNatives();
    facebook::react::DefaultComponentsRegistry::registerNatives();
    facebook::react::EventBeatManager::registerNatives();
    facebook::react::JEmptyReactNativeConfig::registerNatives();
    facebook::react::UIConstantsProviderBinding::registerNatives();
    facebook::react::StateWrapperImpl::registerNatives();
    facebook::react::InspectorNetworkRequestListener::registerNatives();
    facebook::react::ComponentNameResolverBinding::registerNatives();
    facebook::react::NativeMap::registerNatives();
    facebook::react::WritableNativeArray::registerNatives();
    facebook::react::SurfaceHandlerBinding::registerNatives();
    facebook::react::EventEmitterWrapper::registerNatives();
    facebook::react::JInspector::registerNatives();
    facebook::react::ReactInstanceManagerInspectorTarget::registerNatives();
    facebook::react::JReactMarker::registerNatives();
    facebook::react::JReadableMapBuffer::registerNatives();
    facebook::react::NativeArray::registerNatives();
    facebook::react::ReadableNativeMap::registerNatives();
    facebook::react::DefaultTurboModuleManagerDelegate::registerNatives();
    facebook::react::TurboModuleManager::registerNatives();
    facebook::react::CompositeTurboModuleManagerDelegate::registerNatives();
    facebook::react::JReactInstance::registerNatives();
    facebook::react::JJSTimerExecutor::registerNatives();
    facebook::react::JReactHostInspectorTarget::registerNatives();
    facebook::react::jsinspector_modern::JInspectorFlags::registerNatives();
    facebook::react::jsinspector_modern::JCxxInspectorPackagerConnection::registerNatives();
    facebook::react::JReactNativeFeatureFlagsCxxInterop::registerNatives();
    facebook::react::JCxxCallbackImpl::registerNatives();
    facebook::react::CxxModuleWrapperBase::registerNatives();
    facebook::react::JDynamicNative::registerNatives();
    facebook::react::JHermesInstance::registerNatives();
  });
}
