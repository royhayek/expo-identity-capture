/**
 * Face Pose Detector
 *
 * The native face detector of the selfie liveness check, for VisionCamera frame processors:
 * Apple Vision on iOS, ML Kit (Google Play services) on Android.
 *
 * @module FacePoseDetector
 */

import { NitroModules } from 'react-native-nitro-modules';

import type { FacePoseDetector, FacePoseDetectorFactory } from '../specs/FacePose.nitro';

let factory: FacePoseDetectorFactory | null = null;

/**
 * A detector to call from a frame processor (`useFrameOutput`'s `onFrame`): `detector.detect(frame)` answers
 * the faces in the frame, upright and as the preview shows them.
 */
export function createFacePoseDetector(): FacePoseDetector {
  factory ??= NitroModules.createHybridObject<FacePoseDetectorFactory>('FacePoseDetectorFactory');
  return factory.createDetector();
}

export type { FacePose, FacePoseDetector } from '../specs/FacePose.nitro';
