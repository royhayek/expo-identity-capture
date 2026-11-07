import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

/**
 * A face found in a camera frame, in the frame's upright orientation (the frame's `orientation` and
 * `isMirrored` applied, so it reads as the preview shows it).
 */
export interface FacePose {
  /** Bounding box, relative to the upright frame (0-1, origin top-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Head turned sideways, in degrees, as the platform's detector reports it (Apple Vision, ML Kit): its sign
   * convention is the detector's own
   */
  yaw: number;
  /**
   * Head tilted up or down, in degrees, as the platform's detector reports it: Apple Vision counts a head
   * tilted down as positive, ML Kit a head tilted up. `toFaceSample` makes them one convention
   */
  pitch: number;
  /** Head tilted towards a shoulder, in degrees */
  roll: number;
}

/**
 * Finds faces and their head pose in VisionCamera frames, synchronously on the frame's thread:
 * Apple Vision on iOS, ML Kit (Google Play services) on Android.
 */
export interface FacePoseDetector extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  detect(frame: Frame): FacePose[];
}

export interface FacePoseDetectorFactory extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createDetector(): FacePoseDetector;
}
