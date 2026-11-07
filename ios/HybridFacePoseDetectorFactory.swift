import NitroModules

final class HybridFacePoseDetectorFactory: HybridFacePoseDetectorFactorySpec {
  func createDetector() throws -> any HybridFacePoseDetectorSpec {
    return HybridFacePoseDetector()
  }
}
