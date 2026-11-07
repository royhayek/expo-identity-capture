import CoreMedia
import ImageIO
import NitroModules
import Vision
import VisionCamera

/// Finds faces and their head pose in a VisionCamera frame with Apple Vision (built into iOS, nothing to bundle).
/// Revision 3 of the face rectangles request reports roll, yaw and pitch.
final class HybridFacePoseDetector: HybridFacePoseDetectorSpec {
  func detect(frame: any HybridFrameSpec) throws -> [FacePose] {
    // The frame queue drains no autorelease pool of its own: Vision's per-frame objects would pile up for the whole
    // session (older iPhones get killed for memory)
    return try autoreleasepool { try detectFaces(frame: frame) }
  }

  private func detectFaces(frame: any HybridFrameSpec) throws -> [FacePose] {
    guard let nativeFrame = frame as? any NativeFrame else {
      throw RuntimeError.error(withMessage: "Frame is not a VisionCamera NativeFrame!")
    }
    guard let sampleBuffer = nativeFrame.sampleBuffer else {
      throw RuntimeError.error(withMessage: "Frame has no CMSampleBuffer: it was already disposed!")
    }

    let request = VNDetectFaceRectanglesRequest()
    request.revision = VNDetectFaceRectanglesRequestRevision3
    // Vision reads the buffer upright and as shown (mirrored for the front camera), like the preview
    let handler = VNImageRequestHandler(
      cmSampleBuffer: sampleBuffer,
      orientation: frame.orientation.toImagePropertyOrientation(isMirrored: frame.isMirrored),
      options: [:]
    )
    try handler.perform([request])

    return (request.results ?? []).map { face in
      // Vision's boxes are normalised with the origin at the bottom-left
      let box = face.boundingBox
      return FacePose(
        x: box.origin.x,
        y: 1 - box.origin.y - box.height,
        width: box.width,
        height: box.height,
        // Vision's own angles, unchanged: the sign conventions are applied in JS (SelfieLivenessView), so they
        // never depend on which native build a phone runs
        yaw: degrees(face.yaw),
        pitch: degrees(face.pitch),
        roll: degrees(face.roll)
      )
    }
  }

  private func degrees(_ radians: NSNumber?) -> Double {
    return (radians?.doubleValue ?? 0) * 180 / .pi
  }
}

extension CameraOrientation {
  /// The frame's rotation relative to the output, as Vision takes it
  func toImagePropertyOrientation(isMirrored: Bool) -> CGImagePropertyOrientation {
    switch self {
    case .up: return isMirrored ? .upMirrored : .up
    case .down: return isMirrored ? .downMirrored : .down
    case .left: return isMirrored ? .leftMirrored : .left
    case .right: return isMirrored ? .rightMirrored : .right
    }
  }
}
