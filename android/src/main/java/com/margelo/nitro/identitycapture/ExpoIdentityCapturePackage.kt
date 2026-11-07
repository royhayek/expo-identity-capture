package com.margelo.nitro.identitycapture

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Loads the native library (and its Nitro objects) when React Native's autolinking registers the package. */
class ExpoIdentityCapturePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      ExpoIdentityCaptureOnLoad.initializeNative()
    }
  }
}
