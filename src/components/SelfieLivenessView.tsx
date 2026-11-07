/**
 * SelfieLivenessView Component
 *
 * An embeddable selfie camera with a head-turn liveness challenge: the front camera in a circle, ringed by
 * bars that light up and grow in the direction asked as the head turns (ML Kit face angles), then a photo
 * taken on its own once the customer faces the camera again. The photo is checked for a printed photo or a
 * screen (moiré, colour, high-frequency and brightness analysis) before it is handed back.
 *
 * It draws no header, text or buttons: the host app lays its own screen around it and follows
 * `onStateChange` (and calls `restart()` after a failed check).
 *
 * @module SelfieLivenessView
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { createFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { ColorConversionCodes, DataTypes, InterpolationFlags, OpenCV } from 'react-native-fast-opencv';

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
  type LivenessPhase,
} from '../services/LivenessChallenge';
import { scoreLiveness } from '../services/LivenessDetection';
import { cropForGuide } from './DocumentScanView';
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
  code: 'PERMISSION_DENIED' | 'NO_CAMERA' | 'FACE_DETECTION_FAILED' | 'CAPTURE_FAILED';
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
/** Longer side of the image the passive check runs on */
const CHECK_LONG_SIDE = 480;
/** Progress changes smaller than this don't re-render */
const PROGRESS_STEP = 0.05;

// ============================================================================
// Helpers
// ============================================================================

/** A detected face as the challenge reads it */
export function toFaceSample(face: Face): FaceSample {
  const { bounds, frameWidth, frameHeight } = face;
  const shorter = Math.min(frameWidth, frameHeight) || 1;
  const left = face.leftEyeOpenProbability;
  const right = face.rightEyeOpenProbability;
  return {
    yaw: face.yawAngle,
    pitch: face.pitchAngle,
    centerX: frameWidth ? (bounds.x + bounds.width / 2) / frameWidth : 0.5,
    centerY: frameHeight ? (bounds.y + bounds.height / 2) / frameHeight : 0.5,
    size: bounds.width / shorter,
    eyesOpen: left === undefined || right === undefined ? null : left > 0.6 && right > 0.6,
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

/** The passive check on a photo: decoded and scaled down with OpenCV, scored as BGR */
async function scorePhoto(uri: string): Promise<number> {
  const base64 = await new File(uri).base64();
  const decoded = OpenCV.Mat.createFromBase64(base64);
  const { cols, rows, channels } = decoded.toBuffer('uint8');
  const scale = Math.min(1, CHECK_LONG_SIDE / Math.max(cols, rows));
  const width = Math.floor(cols * scale);
  const height = Math.floor(rows * scale);
  const resized = OpenCV.Mat.create(0, 0, channels === 4 ? DataTypes.CV_8UC4 : DataTypes.CV_8UC3);
  OpenCV.resize(decoded, resized, OpenCV.Size.create(width, height), 0, 0, InterpolationFlags.INTER_AREA);
  let bgr = resized;
  if (channels === 4) {
    bgr = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC3);
    OpenCV.cvtColor(resized, bgr, ColorConversionCodes.COLOR_BGRA2BGR);
  }
  const { buffer } = bgr.toBuffer('uint8');
  decoded.release();
  resized.release();
  if (bgr !== resized) bgr.release();
  return scoreLiveness(buffer, width, height).overallScore;
}

const viewStateOf = (challenge: LivenessChallengeState): SelfieLivenessState => ({
  phase: challenge.phase,
  direction: currentDirection(challenge),
  steps: challenge.steps,
  completed: challenge.completed,
  progress: Math.round(challenge.progress / PROGRESS_STEP) * PROGRESS_STEP,
});

const sameViewState = (a: SelfieLivenessState, b: SelfieLivenessState) =>
  a.phase === b.phase &&
  a.direction === b.direction &&
  a.progress === b.progress &&
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

  const device = useCameraDevice('front');
  const { hasPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });

  const pickSteps = useCallback(() => steps ?? shuffledDirections(), [steps]);
  const challengeRef = useRef<LivenessChallengeState>(startChallenge(pickSteps()));
  const [viewState, setViewState] = useState<SelfieLivenessState>(() => viewStateOf(challengeRef.current));

  const publish = useCallback((next: LivenessChallengeState) => {
    challengeRef.current = next;
    const shown = viewStateOf(next);
    setViewState((current) => (sameViewState(current, shown) ? current : shown));
  }, []);

  // ML Kit faces, delivered on the JS thread by a native camera output
  const configRef = useRef(config);
  configRef.current = config;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onFacesDetected = useCallback(
    (faces: Face[]) => {
      if (!isCameraReady) return;
      const face = faces.length === 1 ? toFaceSample(faces[0]) : null;
      const next = advanceChallenge(challengeRef.current, face, Date.now(), configRef.current);
      if (next !== challengeRef.current) publish(next);
    },
    [isCameraReady, publish]
  );
  const onFacesRef = useRef(onFacesDetected);
  onFacesRef.current = onFacesDetected;
  // Created once: the output is a native object, rebuilding it would reconfigure the camera
  const faceOutput = useMemo(
    () =>
      createFaceDetectorOutput({
        performanceMode: 'fast',
        runClassifications: true,
        cameraFacing: 'front',
        outputResolution: 'preview',
        onFacesDetected: (faces) => onFacesRef.current(faces),
        onError: (error) => onErrorRef.current?.({ code: 'FACE_DETECTION_FAILED', message: error.message }),
      }),
    []
  );
  const outputs = useMemo(() => [photoOutput, faceOutput], [photoOutput, faceOutput]);

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
        const image = await ImageManipulator.manipulate(originalUri).renderAsync();
        const crop = cropForGuide(image.width, image.height, size, size, { x: 0, y: 0, width: size, height: size });
        const cropped = await ImageManipulator.manipulate(originalUri)
          .crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height })
          .renderAsync();
        const saved = await cropped.saveAsync({ compress: quality, format: SaveFormat.JPEG });
        const livenessScore = await scorePhoto(saved.uri);
        if (cancelled) return;
        if (livenessScore < livenessThreshold) {
          publish({ ...challengeRef.current, phase: 'notLive' });
          return;
        }
        publish({ ...challengeRef.current, phase: 'done' });
        onCapture({ uri: saved.uri, originalUri, livenessScore });
      } catch (error) {
        if (cancelled) return;
        onErrorRef.current?.({ code: 'CAPTURE_FAILED', message: error instanceof Error ? error.message : String(error) });
        publish({ ...challengeRef.current, phase: 'centering' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [livenessThreshold, onCapture, photoOutput, publish, quality, size, viewState.phase]);

  useEffect(() => {
    onStateChange?.(viewState);
  }, [viewState, onStateChange]);

  useEffect(() => {
    if (!hasPermission) onError?.({ code: 'PERMISSION_DENIED', message: 'Camera permission is not granted' });
    else if (!device) onError?.({ code: 'NO_CAMERA', message: 'No front camera on this device' });
  }, [device, hasPermission, onError]);

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
                isActive={isActive}
                outputs={outputs}
                resizeMode="cover"
                onStarted={() => setIsCameraReady(true)}
                onStopped={() => setIsCameraReady(false)}
                onError={(error) => onError?.({ code: 'NO_CAMERA', message: error.message })}
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
