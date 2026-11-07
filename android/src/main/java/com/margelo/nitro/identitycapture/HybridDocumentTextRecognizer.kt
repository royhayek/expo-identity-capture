package com.margelo.nitro.identitycapture

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.margelo.nitro.core.Promise
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Reads the text of a document photo with ML Kit text recognition. The photo is never decoded whole at full size: the
 * whole photo is read downsampled, a region is decoded on its own (BitmapRegionDecoder), then enlarged when small, so
 * small print such as an MRZ gets more pixels per character on any phone's memory. Reads run one at a time on their
 * own thread: attempts in quick succession never decode several photos at once.
 */
@DoNotStrip
@Keep
class HybridDocumentTextRecognizer : HybridDocumentTextRecognizerSpec() {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val executor: ExecutorService = Executors.newSingleThreadExecutor { task ->
    Thread(task, "ExpoIdentityCapture-text").apply { isDaemon = true }
  }

  init {
    MlKitModels.requestInstall(recognizer)
  }

  @DoNotStrip
  @Keep
  override fun recognize(path: String, region: TextRegion?): Promise<Array<RecognizedTextLine>> {
    val promise = Promise<Array<RecognizedTextLine>>()
    executor.execute {
      try {
        promise.resolve(read(path, region))
      } catch (error: Throwable) {
        promise.reject(error)
      }
    }
    return promise
  }

  private fun read(path: String, region: TextRegion?): Array<RecognizedTextLine> {
    // A file:// URI's path, percent-decoded (a cache path with a space), or a plain path
    val file = if (path.startsWith("file://")) Uri.parse(path).path ?: path.removePrefix("file://") else path
    val orientation = ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Error("Couldn't read the image at $path")

    // The part to read, relative to the upright photo
    val area = region ?: TextRegion(0.0, 0.0, 1.0, 1.0)
    val bitmap = if (region == null) {
      decodeWhole(file, bounds.outWidth, bounds.outHeight, orientation)
    } else {
      decodeRegion(file, bounds.outWidth, bounds.outHeight, orientation, area)
    } ?: throw Error("Couldn't decode the image at $path")

    try {
      val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), RECOGNITION_TIMEOUT_S, TimeUnit.SECONDS)
      val width = bitmap.width.toDouble()
      val height = bitmap.height.toDouble()
      return text.textBlocks.flatMap { it.lines }.mapNotNull { line ->
        val box = line.boundingBox ?: return@mapNotNull null
        // Relative to the decoded part, then to the whole upright photo
        RecognizedTextLine(
          text = line.text,
          x = area.x + box.left / width * area.width,
          y = area.y + box.top / height * area.height,
          width = box.width() / width * area.width,
          height = box.height() / height * area.height,
          confidence = line.confidence.toDouble()
        )
      }.toTypedArray()
    } finally {
      bitmap.recycle()
    }
  }

  /**
   * The whole photo, upright, its longer side at most WHOLE_PHOTO_SIDE: decoded already reduced (never above
   * MAX_DECODE_SIDE: a 12 MP photo is 48 MB at full size), then scaled and turned in one step
   */
  private fun decodeWhole(file: String, width: Int, height: Int, orientation: Int): Bitmap? {
    var sample = 1
    while (max(width, height) / sample > MAX_DECODE_SIDE) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = BitmapFactory.decodeFile(file, options) ?: return null
    val scale = min(1f, WHOLE_PHOTO_SIDE.toFloat() / max(decoded.width, decoded.height))
    return transform(decoded, orientation, scale)
  }

  /** Only the region, upright, about REGION_WIDTH across: decoded at a reduced size when larger, enlarged when smaller */
  private fun decodeRegion(file: String, width: Int, height: Int, orientation: Int, region: TextRegion): Bitmap? {
    val raw = rawRegion(region, orientation)
    val rect = Rect(
      (raw.x * width).roundToInt().coerceIn(0, width - 1),
      (raw.y * height).roundToInt().coerceIn(0, height - 1),
      ((raw.x + raw.width) * width).roundToInt().coerceIn(1, width),
      ((raw.y + raw.height) * height).roundToInt().coerceIn(1, height)
    )
    if (rect.width() <= 0 || rect.height() <= 0) return null
    val sideways = orientation == ExifInterface.ORIENTATION_ROTATE_90 || orientation == ExifInterface.ORIENTATION_ROTATE_270
    val uprightWidth = if (sideways) rect.height() else rect.width()
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(uprightWidth, REGION_WIDTH) }
    @Suppress("DEPRECATION")
    val decoder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) BitmapRegionDecoder.newInstance(file)
      else BitmapRegionDecoder.newInstance(file, false)) ?: return null
    val decoded = try { decoder.decodeRegion(rect, options) } finally { decoder.recycle() } ?: return null
    val turned = transform(decoded, orientation, 1f)
    // Small print read better enlarged: up to MAX_SCALE, to about REGION_WIDTH across
    val scale = min(MAX_SCALE, max(1.0, REGION_WIDTH.toDouble() / turned.width))
    if (scale == 1.0) return turned
    val enlarged = Bitmap.createScaledBitmap(turned, (turned.width * scale).roundToInt(), (turned.height * scale).roundToInt(), true)
    if (enlarged !== turned) turned.recycle()
    return enlarged
  }

  /** The upright region in the stored (un-rotated) pixels, for an EXIF orientation */
  private fun rawRegion(region: TextRegion, orientation: Int): TextRegion = when (orientation) {
    ExifInterface.ORIENTATION_ROTATE_90 -> TextRegion(region.y, 1 - region.x - region.width, region.height, region.width)
    ExifInterface.ORIENTATION_ROTATE_180 -> TextRegion(1 - region.x - region.width, 1 - region.y - region.height, region.width, region.height)
    ExifInterface.ORIENTATION_ROTATE_270 -> TextRegion(1 - region.y - region.height, region.x, region.height, region.width)
    else -> region
  }

  /**
   * The photo as it is seen, scaled: turned by its EXIF orientation (which the camera often sets instead of turning the
   * pixels) in the same step as the scaling, one new bitmap at most
   */
  private fun transform(bitmap: Bitmap, orientation: Int, scale: Float): Bitmap {
    val degrees = when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
    if (degrees == 0f && scale >= 1f) return bitmap
    val matrix = Matrix().apply {
      postScale(scale, scale)
      postRotate(degrees)
    }
    val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (turned !== bitmap) bitmap.recycle()
    return turned
  }

  /** The largest power of two that keeps `side` at least `target` */
  private fun sampleSize(side: Int, target: Int): Int {
    var sample = 1
    while (side / (sample * 2) >= target) sample *= 2
    return sample
  }

  override fun dispose() {
    executor.shutdown()
    recognizer.close()
    super.dispose()
  }

  private companion object {
    const val WHOLE_PHOTO_SIDE = 2400
    const val MAX_DECODE_SIDE = 3200
    const val REGION_WIDTH = 2000
    const val MAX_SCALE = 2.5
    const val RECOGNITION_TIMEOUT_S = 20L
  }
}
