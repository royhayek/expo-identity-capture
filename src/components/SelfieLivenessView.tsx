/**
 * SelfieLivenessView Component
 *
 * An embeddable selfie camera with a head-turn liveness challenge: the front camera in a circle, ringed by
 * bars that light up and grow in the direction asked as the head turns (face angles from Apple Vision on
 * iOS, ML Kit on Android, read in a frame processor), then a photo
 * taken on its own once the customer faces the camera again. The photo is checked for a printed photo or a
 * screen (moiré, colour, high-frequency and brightness analysis) before it is handed back.
 *
 * It draws no header, text or buttons: the host app lays its own screen around it and follows
 * `onStateChange` (and calls `restart()` after a failed check).
 *
 * @module SelfieLivenessView
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Camera, CommonResolutions, useFrameOutput, usePhotoOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { File } from 'expo-file-system';
import { ColorConversionCodes, DataTypes, OpenCV } from 'react-native-fast-opencv';

import {
  DEFAULT_CHALLENGE_CONFIG,
  advanceChallenge,
  currentDirection,
  shuffledDirections,
  startChallenge,
  type FaceSample,
  type LivenessChallengeConfig,
  type LivenessChallengeState,
  type LivenessDirection,
  type LivenessHint,
  type LivenessPhase,
} from '../services/LivenessChallenge';
import { useCameraAccess } from '../hooks/useCameraAccess';
import { scoreLiveness } from '../services/LivenessDetection';
import { createFacePoseDetector, type FacePose, type FacePoseDetector } from '../core/FacePoseDetector';
import { cropToFile } from '../utils/cropToFile';
import { cropForGuide } from './DocumentScanView';
import { FRAME_RESOLUTION } from '../utils/guide';
import { toFileUri } from '../utils/fileUri';

// ============================================================================
// Types
// ============================================================================

/** What the host shows around the camera */
export interface SelfieLivenessState {
  phase: LivenessPhase;
  /** The direction asked now, or null */
  direction: LivenessDirection | null;
  /** Every direction, in the order asked */
  steps: LivenessDirection[];
  completed: LivenessDirection[];
  /** How far the current direction is (0-1) */
  progress: number;
  /**
   * Why the face doesn't count yet, for the copy: `tooClose` ("move the phone a little further"), `tooFar`,
   * `offCentre`, `turned` ("look straight at the camera"). Null when nothing is wrong
   */
  hint: LivenessHint | null;
}

export interface SelfieLivenessResult {
  /** The selfie cropped to the circle (file://) */
  uri: string;
  /** The whole photo (file://) */
  originalUri: string;
  /** The passive check's score (0-1, higher is more likely a live face) */
  livenessScore: number;
}

export interface SelfieLivenessError {
  /** `CAMERA_FAILED`: the camera stopped on its own (in use by another app, a call, the system) */
  code: 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAMERA_FAILED' | 'FACE_DETECTION_FAILED' | 'CAPTURE_FAILED';
  message: string;
}

export interface SelfieLivenessColors {
  idle: string;
  active: string;
  activeEdge: string;
  done: string;
  error: string;
  warning: string;
}

export interface SelfieLivenessViewProps {
  style?: StyleProp<ViewStyle>;
  isActive?: boolean;
  /** The directions to ask, in order. Default: left, right and up, shuffled each time */
  steps?: LivenessDirection[];
  /** Thresholds and timing of the challenge */
  challenge?: Partial<LivenessChallengeConfig>;
  /** Passive check score under which the photo is refused (0-1). Default 0.5 */
  livenessThreshold?: number;
  colors?: Partial<SelfieLivenessColors>;
  /** JPEG quality of the cropped selfie (0-1). Default 0.9 */
  quality?: number;
  onStateChange?: (state: SelfieLivenessState) => void;
  onCapture: (result: SelfieLivenessResult) => void;
  onError?: (error: SelfieLivenessError) => void;
}

export interface SelfieLivenessViewRef {
  /** Starts the challenge again (after a failed check, or to retake) */
  restart: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLORS: SelfieLivenessColors = {
  idle: '#D4D9E6',
  active: '#55D4C9',
  activeEdge: '#7CF8E7',
  done: '#3DB8AF',
  error: '#E65359',
  warning: '#F3B44A',
};

const RING = {
  BARS: 80,
  BAR_WIDTH: 4,
  /** Bar length at rest, and its longest while lighting up */
  REST: 10,
  LONGEST: 24,
  /** Space between the face window and the bars */
  GAP: 8,
  /** Half of each direction's arc, in degrees */
  HALF_ARC: 45,
};
/** Each direction's place on the ring (degrees, 0 = right, clockwise) */
const ARC_CENTRES: Record<LivenessDirection, number> = { right: 0, up: 270, left: 180 };
/**
 * Side of the square the passive check runs on, taken from the photo's centre at its own resolution: scaling the photo
 * down would average away the screen's pixel grid and moiré the check looks for
 */
const CHECK_SIDE = 480;
/** Progress changes smaller than this don't re-render */
const PROGRESS_STEP = 0.05;
const FRAME_PROCESSING = {
  /** Look for the face about 10 times a second, whatever the camera's frame rate (30 or 60 fps) */
  INTERVAL_MS: 100,
  /** Faces are small enough at preview size; the detectors scale down further themselves. Framed like the preview */
  TARGET_RESOLUTION: FRAME_RESOLUTION,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * The sign that makes the platform detector's pitch "positive = head up", the challenge's convention.
 * Apple Vision counts a head tilted down as positive (measured on an iPhone 16 Pro Max: head bowed to the
 * phone +20°, tilted back -37°); ML Kit counts a head tilted up as positive. Applied here, in JS, so it holds
 * whichever native build a phone runs.
 */
export const PITCH_UP_SIGN: 1 | -1 = Platform.OS === 'ios' ? -1 : 1;

/**
 * A detected face as the challenge reads it. The pose's box is relative to the upright frame, whose sides
 * are the buffer's swapped when the buffer is rotated a quarter turn.
 */
export function toFaceSample(
  pose: FacePose,
  uprightWidth: number,
  uprightHeight: number,
  pitchUpSign: 1 | -1 = PITCH_UP_SIGN
): FaceSample {
  'worklet';
  const shorter = Math.min(uprightWidth, uprightHeight) || 1;
  return {
    yaw: pose.yaw,
    pitch: pitchUpSign * pose.pitch,
    centerX: pose.x + pose.width / 2,
    centerY: pose.y + pose.height / 2,
    size: (pose.width * uprightWidth) / shorter,
    // Neither detector is asked for eye state
    eyesOpen: null,
  };
}

interface Bar {
  color: string;
  length: number;
  opacity: number;
}

/** Each bar's look for a state: lit and grown from the asked arc's centre outward, finished arcs settled */
function barsFor(state: SelfieLivenessState, colors: SelfieLivenessColors): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < RING.BARS; i++) {
    const angle = (i * 360) / RING.BARS;
    let bar: Bar = { color: colors.idle, length: RING.REST, opacity: 1 };
    if (state.phase === 'centering' || state.phase === 'capturing' || state.phase === 'done') {
      bar = { color: colors.active, length: 18, opacity: 1 };
    } else if (state.phase === 'notLive') {
      bar = { color: colors.error, length: 14, opacity: 1 };
    } else if (state.phase === 'faceLost') {
      bar = { color: colors.warning, length: 12, opacity: i % 2 ? 0.45 : 1 };
    } else {
      for (const direction of state.steps) {
        const distance = Math.abs(((angle - ARC_CENTRES[direction] + 540) % 360) - 180);
        if (distance > RING.HALF_ARC) continue;
        if (state.completed.includes(direction)) {
          bar = { color: colors.done, length: 16, opacity: 1 };
        } else if (direction === state.direction) {
          const reach = RING.HALF_ARC * state.progress;
          bar =
            distance <= reach - 6
              ? { color: colors.active, length: RING.LONGEST, opacity: 1 }
              : distance <= reach
                ? { color: colors.activeEdge, length: 16 + (reach - distance), opacity: 1 }
                : { color: colors.idle, length: 12, opacity: 1 };
        }
      }
    }
    bars.push(bar);
  }
  return bars;
}

/** The passive check on a photo: its centre square decoded with OpenCV at the photo's resolution, scored as BGR */
async function scorePhoto(uri: string): Promise<number> {
  const decoded = OpenCV.Mat.createFromBase64(await new File(uri).base64());
  const { cols, rows } = decoded;
  const side = Math.min(CHECK_SIDE, cols, rows);
  const centre = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC3);
  OpenCV.crop(decoded, centre, OpenCV.Rect.create(Math.floor((cols - side) / 2), Math.floor((rows - side) / 2), side, side));
  decoded.release();
  let bgr = centre;
  const channels = centre.toBuffer('uint8').channels;
  if (channels === 4) {
    bgr = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC3);
    OpenCV.cvtColor(centre, bgr, ColorConversionCodes.COLOR_BGRA2BGR);
    centre.release();
  }
  const { buffer } = bgr.toBuffer('uint8');
  bgr.release();
  return scoreLiveness(buffer, side, side).overallScore;
}

const viewStateOf = (challenge: LivenessChallengeState): SelfieLivenessState => ({
  phase: challenge.phase,
  direction: currentDirection(challenge),
  steps: challenge.steps,
  completed: challenge.completed,
  progress: Math.round(challenge.progress / PROGRESS_STEP) * PROGRESS_STEP,
  hint: challenge.hint,
});

const sameViewState = (a: SelfieLivenessState, b: SelfieLivenessState) =>
  a.phase === b.phase &&
  a.direction === b.direction &&
  a.progress === b.progress &&
  a.hint === b.hint &&
  a.completed.length === b.completed.length &&
  a.steps.join() === b.steps.join();

// ============================================================================
// Component
// ============================================================================

export const SelfieLivenessView = forwardRef<SelfieLivenessViewRef, SelfieLivenessViewProps>(function SelfieLivenessView(
  {
    style,
    isActive = true,
    steps,
    challenge: challengeConfig,
    livenessThreshold = 0.5,
    colors: colorOverrides,
    quality = 0.9,
    onStateChange,
    onCapture,
    onError,
  },
  ref
) {
  const colors = useMemo(() => ({ ...DEFAULT_COLORS, ...colorOverrides }), [colorOverrides]);
  const config = useMemo(() => ({ ...DEFAULT_CHALLENGE_CONFIG, ...challengeConfig }), [challengeConfig]);
  const [size, setSize] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const camera = useCameraAccess('front', isActive);
  const { device, hasPermission } = camera;
  // A selfie needs no more than 1440 × 1920: a phone's full sensor would only make the photo slower to take, crop and send
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality', targetResolution: CommonResolutions.FHD_4_3 });

  const pickSteps = useCallback(() => steps ?? shuffledDirections(), [steps]);
  const challengeRef = useRef<LivenessChallengeState>(startChallenge(pickSteps()));
  const [viewState, setViewState] = useState<SelfieLivenessState>(() => viewStateOf(challengeRef.current));

  const publish = useCallback((next: LivenessChallengeState) => {
    challengeRef.current = next;
    const shown = viewStateOf(next);
    setViewState((current) => (sameViewState(current, shown) ? current : shown));
  }, []);

  // Faces from the native detector, on the frame output's thread; each sample is handed to the challenge here
  const configRef = useRef(config);
  configRef.current = config;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // Read through a ref: a new callback each render must not restart (and so cancel) a photo being taken
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const isCameraReadyRef = useRef(isCameraReady);
  isCameraReadyRef.current = isCameraReady;
  const lastLogRef = useRef(0);
  const handleSample = useCallback(
    (face: FaceSample | null) => {
      if (!isCameraReadyRef.current) return;
      detectionFailedRef.current = false;
      const now = Date.now();
      const next = advanceChallenge(challengeRef.current, face, now, configRef.current);
      // Development builds only: the angles the challenge reads, twice a second, to tune thresholds and signs
      if (__DEV__ && now - lastLogRef.current > 500) {
        lastLogRef.current = now;
        const neutral = next.neutral ?? { yaw: 0, pitch: 0 };
        console.log(
          face
            ? `[Liveness] ${next.phase} ${currentDirection(next) ?? ''} yaw ${(face.yaw - neutral.yaw).toFixed(1)}° ` +
                `pitch ${(face.pitch - neutral.pitch).toFixed(1)}° centre ${face.centerX.toFixed(2)},${face.centerY.toFixed(2)} ` +
                `size ${face.size.toFixed(2)} progress ${next.progress.toFixed(2)}`
            : `[Liveness] ${next.phase} no face`
        );
      }
      if (next !== challengeRef.current) publish(next);
    },
    [publish]
  );
  // Once per failure, not on every frame: an unavailable detector (Android, Play services still downloading the model,
  // or missing) fails each frame until it recovers
  const detectionFailedRef = useRef(false);
  const handleDetectionError = useCallback((message: string) => {
    if (detectionFailedRef.current) return;
    detectionFailedRef.current = true;
    onErrorRef.current?.({ code: 'FACE_DETECTION_FAILED', message });
  }, []);
  // Development builds only: the detector's raw reading and how the frame is turned, to check orientation and signs
  const logRawPose = useCallback((line: string) => {
    console.log(`[Liveness raw] ${line}`);
  }, []);

  // Made and disposed by the same effect: a detector made in a memo would stay disposed after React's development
  // double-run of effects (StrictMode), and fail on every frame
  const [detector, setDetector] = useState<FacePoseDetector | null>(null);
  useEffect(() => {
    const made = createFacePoseDetector();
    setDetector(made);
    return () => {
      setDetector(null);
      made.dispose();
    };
  }, []);

  // Captured by the frame worklet as a plain number
  const pitchUpSign = PITCH_UP_SIGN;
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';

      try {
        const runtime = globalThis as unknown as { __selfieLivenessLastAt?: number };
        const now = Date.now();
        if (now - (runtime.__selfieLivenessLastAt ?? 0) < FRAME_PROCESSING.INTERVAL_MS) {
          return;
        }
        runtime.__selfieLivenessLastAt = now;
        if (detector === null) return;
        const sideways = frame.orientation === 'left' || frame.orientation === 'right';
        const uprightWidth = sideways ? frame.height : frame.width;
        const uprightHeight = sideways ? frame.width : frame.height;
        const faces = detector.detect(frame);
        if (__DEV__) {
          const debug = globalThis as unknown as { __selfieLivenessLogCount?: number };
          debug.__selfieLivenessLogCount = ((debug.__selfieLivenessLogCount ?? 0) + 1) % 5;
          if (debug.__selfieLivenessLogCount === 0) {
            const pose = faces[0];
            scheduleOnRN(
              logRawPose,
              `frame ${frame.width}x${frame.height} orientation=${frame.orientation} mirrored=${frame.isMirrored} faces=${faces.length}` +
                (pose
                  ? ` yaw=${pose.yaw.toFixed(1)} pitch=${pose.pitch.toFixed(1)} roll=${pose.roll.toFixed(1)} box=${pose.x.toFixed(2)},${pose.y.toFixed(2)} ${pose.width.toFixed(2)}x${pose.height.toFixed(2)}`
                  : '')
            );
          }
        }
        // One face only: none, or more than one, is no face for the challenge
        scheduleOnRN(
          handleSample,
          faces.length === 1 ? toFaceSample(faces[0], uprightWidth, uprightHeight, pitchUpSign) : null
        );
      } catch (error) {
        scheduleOnRN(handleDetectionError, error instanceof Error ? error.message : String(error));
      } finally {
        frame.dispose();
      }
    },
    [detector, handleDetectionError, handleSample, logRawPose, pitchUpSign]
  );

  // YUV: what both detectors read natively, without a conversion in the camera pipeline
  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: FRAME_PROCESSING.TARGET_RESOLUTION,
    onFrame,
    onFrameDropped: () => undefined,
  });
  const outputs = useMemo(() => [photoOutput, frameOutput], [photoOutput, frameOutput]);

  const restart = useCallback(() => publish(startChallenge(pickSteps())), [pickSteps, publish]);
  useImperativeHandle(ref, () => ({ restart }), [restart]);

  // Facing the camera again: take the photo, crop it to the circle, check it, hand it back
  useEffect(() => {
    if (viewState.phase !== 'capturing' || !size) return;
    let cancelled = false;
    (async () => {
      try {
        const photo = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
        const originalUri = toFileUri(photo.filePath);
        const saved = await cropToFile(originalUri, (width, height) =>
          cropForGuide(width, height, size, size, { x: 0, y: 0, width: size, height: size }), quality);
        const livenessScore = await scorePhoto(saved.uri);
        if (cancelled) return;
        if (livenessScore < livenessThreshold) {
          publish({ ...challengeRef.current, phase: 'notLive' });
          return;
        }
        publish({ ...challengeRef.current, phase: 'done' });
        onCaptureRef.current({ uri: saved.uri, originalUri, livenessScore });
      } catch (error) {
        if (cancelled) return;
        onErrorRef.current?.({ code: 'CAPTURE_FAILED', message: error instanceof Error ? error.message : String(error) });
        // Facing the camera again from the start: kept, the alignment would take the next photo at once, in a loop
        publish({ ...challengeRef.current, phase: 'centering', alignedSince: null, misalignedSince: null, smoothed: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [livenessThreshold, photoOutput, publish, quality, size, viewState.phase]);

  useEffect(() => {
    onStateChange?.(viewState);
  }, [viewState, onStateChange]);

  useEffect(() => {
    if (camera.problem === 'PERMISSION_DENIED') onError?.({ code: 'PERMISSION_DENIED', message: 'Camera permission is not granted' });
    else if (camera.problem === 'NO_CAMERA') onError?.({ code: 'NO_CAMERA', message: 'No front camera on this device' });
  }, [camera.problem, onError]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(Math.min(width, height));
  }, []);

  const bars = useMemo(() => barsFor(viewState, colors), [viewState, colors]);
  const centre = size / 2;
  const windowRadius = centre - RING.LONGEST - RING.GAP - RING.BAR_WIDTH;
  const barStart = windowRadius + RING.GAP;

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      {size > 0 ? (
        <>
          <View
            style={[
              styles.window,
              { width: windowRadius * 2, height: windowRadius * 2, borderRadius: windowRadius, left: centre - windowRadius, top: centre - windowRadius },
            ]}>
            {hasPermission && device ? (
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={camera.isActive}
                outputs={outputs}
                resizeMode="cover"
                onStarted={() => setIsCameraReady(true)}
                onStopped={() => setIsCameraReady(false)}
                onError={(error) => onError?.({ code: 'CAMERA_FAILED', message: error.message })}
              />
            ) : null}
          </View>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
            {bars.map((bar, i) => {
              const radians = ((i * 360) / RING.BARS) * (Math.PI / 180);
              const cos = Math.cos(radians);
              const sin = Math.sin(radians);
              return (
                <Line
                  key={i}
                  x1={centre + barStart * cos}
                  y1={centre + barStart * sin}
                  x2={centre + (barStart + bar.length) * cos}
                  y2={centre + (barStart + bar.length) * sin}
                  stroke={bar.color}
                  strokeOpacity={bar.opacity}
                  strokeWidth={RING.BAR_WIDTH}
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    aspectRatio: 1,
  },
  window: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#616A88',
  },
});

export default SelfieLivenessView;
