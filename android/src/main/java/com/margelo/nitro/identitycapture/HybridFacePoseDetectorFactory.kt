package com.margelo.nitro.identitycapture

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
@Keep
class HybridFacePoseDetectorFactory : HybridFacePoseDetectorFactorySpec() {
  @DoNotStrip
  @Keep
  override fun createDetector(): HybridFacePoseDetectorSpec {
    return HybridFacePoseDetector()
  }
}
