import Foundation
import ImageIO
import NitroModules
import Vision

/// Reads the text of a document photo with Apple Vision (built into iOS, nothing to bundle), set up for documents:
/// the accurate recognizer, and no language correction, which would rewrite an MRZ ("<<<" into words).
final class HybridDocumentTextRecognizer: HybridDocumentTextRecognizerSpec {
  /// The longest side the photo is decoded at: enough for an MRZ, without a 48 MP photo's 190 MB bitmap on an older phone
  private static let wholePhotoSide = 3000
  /// A region is read from a sharper copy: its small print gets more pixels
  private static let regionPhotoSide = 4200
  /// Vision skips text smaller than this share of the image's height (default 1/32): an MRZ on a whole passport page is
  /// about 1/45
  private static let minimumTextHeight: Float = 0.012

  func recognize(path: String, region: TextRegion?) throws -> Promise<[RecognizedTextLine]> {
    // Vision's region: normalised in the upright image, with the origin at the bottom-left
    let roi = region.map { CGRect(x: $0.x, y: 1 - $0.y - $0.height, width: $0.width, height: $0.height) }
    return Promise.parallel(.global(qos: .userInitiated)) {
      // A global queue drains no autorelease pool per block: the decoded image and Vision's results go with this read
      try autoreleasepool { try HybridDocumentTextRecognizer.read(path: path, roi: roi) }
    }
  }

  private static func read(path: String, roi: CGRect?) throws -> [RecognizedTextLine] {
    let image = try uprightImage(path: path, maxSide: roi == nil ? wholePhotoSide : regionPhotoSide)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = languages(for: request, includingArabic: roi == nil)
    if let roi {
      request.regionOfInterest = roi
    } else {
      request.minimumTextHeight = minimumTextHeight
    }
    try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])

    return (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      // Boxes come relative to the region when one is set: brought back to the whole image, origin top-left
      let area = roi ?? CGRect(x: 0, y: 0, width: 1, height: 1)
      let box = observation.boundingBox
      let x = area.minX + box.minX * area.width
      let bottom = area.minY + box.minY * area.height
      let height = box.height * area.height
      return RecognizedTextLine(
        text: candidate.string,
        x: x,
        y: 1 - bottom - height,
        width: box.width * area.width,
        height: height,
        confidence: Double(candidate.confidence)
      )
    }
  }

  /// The photo decoded no larger than `maxSide`, with its EXIF orientation applied (the camera often sets it instead of
  /// turning the pixels)
  private static func uprightImage(path: String, maxSide: Int) throws -> CGImage {
    let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
    guard let url, let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw RuntimeError.error(withMessage: "Couldn't read the image at \(path)")
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxSide,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw RuntimeError.error(withMessage: "Couldn't decode the image at \(path)")
    }
    return image
  }

  /// Latin first (an MRZ, and most IDs' printed fields); Arabic too where this iOS version reads it, for the whole photo
  /// only, so the MRZ band is never read as Arabic
  private static func languages(for request: VNRecognizeTextRequest, includingArabic: Bool) -> [String] {
    var languages = ["en-US", "fr-FR"]
    if includingArabic, let supported = try? request.supportedRecognitionLanguages() {
      languages += ["ar-SA", "ar"].filter { supported.contains($0) }.prefix(1)
    }
    return languages
  }
}
