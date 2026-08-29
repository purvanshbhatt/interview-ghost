package com.cue.interviewhelper

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.ExternalSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher

class MainApplication : Application(), ReactApplication {

  init {
    loadNativeLibraries()
  }

  companion object {
    init {
      loadNativeLibraries()
    }

    private fun loadNativeLibraries() {
      try {
        System.loadLibrary("fbjni")
      } catch (e: Throwable) {
      }
      try {
        System.loadLibrary("reactnative")
      } catch (e: Throwable) {
      }
      try {
        System.loadLibrary("appmodules")
      } catch (e: Throwable) {
      }
      populateSoLoader()
      setupFeatureFlags()
    }

    private fun setupFeatureFlags() {
      try {
        val localAccessor = com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsLocalAccessor()
        val accessorField = com.facebook.react.internal.featureflags.ReactNativeFeatureFlags::class.java.getDeclaredField("accessor")
        accessorField.isAccessible = true
        accessorField.set(null, localAccessor)
        com.facebook.react.internal.featureflags.ReactNativeFeatureFlags.override(
          com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults(true)
        )
      } catch (e: Throwable) {
      }
    }

    private fun populateSoLoader() {
      try {
        val loadedLibsField = com.facebook.soloader.SoLoader::class.java.getDeclaredField("sLoadedLibraries")
        loadedLibsField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val loadedLibs = loadedLibsField.get(null) as? MutableSet<String>
        val fakeLibs = listOf(
          "hermesinstancejni", "libhermesinstancejni.so",
          "jscinstance", "libjscinstance.so",
          "jscinstancejni", "libjscinstancejni.so",
          "hermes_executor", "libhermes_executor.so",
          "hermes", "libhermes.so",
          "jscexecutor", "libjscexecutor.so",
          "rninstance", "librninstance.so",
          "react_featureflagsjni", "libreact_featureflagsjni.so",
          "react_newarchdefaults", "libreact_newarchdefaults.so",
          "react_devsupportjni", "libreact_devsupportjni.so",
          "turbomodulejsijni", "libturbomodulejsijni.so",
          "fabricjni", "libfabricjni.so",
          "uimanagerjni", "libuimanagerjni.so",
          "mapbufferjni", "libmapbufferjni.so",
          "jsijniprofiler", "libjsijniprofiler.so",
          "reactnativeblob", "libreactnativeblob.so",
          "reactnativejni", "libreactnativejni.so",
          "react_codegen_rncore", "libreact_codegen_rncore.so",
          "yoga", "libyoga.so"
        )
        loadedLibs?.addAll(fakeLibs)

        val loadedAndJniField = com.facebook.soloader.SoLoader::class.java.getDeclaredField("sLoadedAndJniInvoked")
        loadedAndJniField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val loadedAndJni = loadedAndJniField.get(null) as? MutableSet<String>
        loadedAndJni?.addAll(fakeLibs)
      } catch (e: Throwable) {
      }
    }
  }

  override val reactNativeHost: ReactNativeHost =
    object : DefaultReactNativeHost(this) {
      override fun getPackages(): List<ReactPackage> {
        val packages = PackageList(this).packages.toMutableList()
        packages.add(expo.modules.ExpoModulesPackage())
        return packages
      }

      override fun getJSMainModuleName(): String = "index"

      override fun getBundleAssetName(): String = "index.android.bundle"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
    }

  override val reactHost: com.facebook.react.ReactHost
    get() = com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    com.facebook.react.config.ReactFeatureFlags.enableBridgelessArchitecture = true
    com.facebook.react.config.ReactFeatureFlags.useTurboModules = true
    com.facebook.react.config.ReactFeatureFlags.enableFabricRenderer = true
    SoLoader.init(this, false)
    loadNativeLibraries()
    setupFeatureFlags()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
