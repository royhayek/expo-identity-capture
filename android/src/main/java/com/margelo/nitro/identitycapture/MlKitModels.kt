package com.margelo.nitro.identitycapture

import android.util.Log
import com.google.android.gms.common.api.OptionalModuleApi
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.margelo.nitro.NitroModules

/**
 * ML Kit's models through Google Play services download on first use: the first scan after an install would fail or
 * wait. Asked for as soon as a detector is made, they are usually there by the time the camera opens. Nothing to do
 * when the app bundles the models (`ExpoIdentityCapture_bundledMlKit=true`, for phones without Play services).
 */
internal object MlKitModels {
  fun requestInstall(api: Any) {
    if (BuildConfig.BUNDLED_MLKIT || api !is OptionalModuleApi) return
    val context = NitroModules.applicationContext ?: return
    try {
      ModuleInstall.getClient(context)
        .installModules(ModuleInstallRequest.newBuilder().addApi(api).build())
        .addOnFailureListener { error -> Log.w(TAG, "ML Kit models couldn't be installed yet: ${error.message}") }
    } catch (error: Throwable) {
      // No Play services on this phone: the detector reports it when used
      Log.w(TAG, "ML Kit models couldn't be requested: ${error.message}")
    }
  }

  private const val TAG = "ExpoIdentityCapture"
}
