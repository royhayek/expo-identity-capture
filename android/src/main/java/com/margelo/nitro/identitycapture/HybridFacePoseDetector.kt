package com.margelo.nitro.identitycapture

import androidx.annotation.Keep
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import com.facebook.proguard.annotations.DoNotStrip
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Finds faces and their head pose in a VisionCamera frame with ML Kit face detection. Poses are given as the preview
 * shows them: upright, and mirrored like the frame.
 *
 * Called on the camera's frame thread, which it never holds for long: one detection at a time (a slow phone's next
 * frames answer the last faces meanwhile), bounded by a timeout, and none once disposed.
 */
@DoNotStrip
@Keep
class HybridFacePoseDetector : HybridFacePoseDetectorSpec() {
  private val detector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      // Head angles come in fast mode too (only contours would drop them)
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
      .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
      // The selfie's face fills the circle: smaller faces are never the customer's, and skipping them is faster
      .setMinFaceSize(MIN_FACE_SIZE)
      .build()
  )
  private val lock = Any()
  @Volatile private var closed = false
  private val busy = AtomicBoolean(false)
  @Volatile private var lastFaces: Array<FacePose> = emptyArray()

  init {
    MlKitModels.requestInstall(detector)
  }

  @OptIn(ExperimentalGetImage::class)
  @DoNotStrip
  @Keep
  override fun detect(frame: HybridFrameSpec): Array<FacePose> {
    if (closed) return emptyArray()
    // Still on the last frame: answer its faces rather than queue another detection behind it
    if (!busy.compareAndSet(false, true)) return lastFaces
    var released = false
    try {
      val nativeFrame = frame as? NativeFrame ?: throw Error("Frame is not a VisionCamera NativeFrame!")
      val mediaImage = nativeFrame.image.image ?: throw Error("Frame has no Image: it was already disposed!")
      val rotation = nativeFrame.image.imageInfo.rotationDegrees

      // ML Kit's boxes are in the rotated (upright) image
      val sideways = rotation == 90 || rotation == 270
      val width = (if (sideways) mediaImage.height else mediaImage.width).toDouble()
      val height = (if (sideways) mediaImage.width else mediaImage.height).toDouble()
      val mirrored = frame.isMirrored

      val task = synchronized(lock) {
        if (closed) return emptyArray()
        detector.process(InputImage.fromMediaImage(mediaImage, rotation))
      }
      // The detection may outlive the wait: the next one starts only once it is over
      task.addOnCompleteListener { busy.set(false) }
      released = true
      val faces = try {
        Tasks.await(task, DETECTION_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      } catch (timeout: TimeoutException) {
        return lastFaces
      }
      lastFaces = faces.map { face ->
        val box = face.boundingBox
        val left = box.left / width
        val boxWidth = box.width() / width
        // A mirrored frame shows the face flipped: its box and sideways angles flip with it
        FacePose(
          x = if (mirrored) 1 - left - boxWidth else left,
          y = box.top / height,
          width = boxWidth,
          height = box.height() / height,
          yaw = (if (mirrored) -face.headEulerAngleY else face.headEulerAngleY).toDouble(),
          pitch = face.headEulerAngleX.toDouble(),
          roll = (if (mirrored) -face.headEulerAngleZ else face.headEulerAngleZ).toDouble()
        )
      }.toTypedArray()
      return lastFaces
    } finally {
      // No detection was started: free the next frame
      if (!released) busy.set(false)
    }
  }

  override fun dispose() {
    synchronized(lock) {
      closed = true
      detector.close()
    }
    super.dispose()
  }

  private companion object {
    const val DETECTION_TIMEOUT_MS = 1000L
    const val MIN_FACE_SIZE = 0.25f
  }
}
