/**
 * DocumentScanView Component
 *
 * An embeddable live document camera: the back camera in a rounded viewport, a frame guide sized for the
 * document (an ID-1 card, or an upright passport page) with the outside dimmed, OpenCV edge detection on the
 * frames and a photo taken on its own once the document holds still, cropped to the frame.
 *
 * It draws no header, text or buttons: the host app lays its own screen around it and follows
 * `onStatusChange` (and calls `capture()` for a manual shutter).
 *
 * @module DocumentScanView
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Camera, CommonResolutions, useFrameOutput, usePhotoOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { File } from 'expo-file-system';

import { useCameraAccess } from '../hooks/useCameraAccess';
import { documentTextRecognizer } from '../core/DocumentTextRecognizer';
import { readIdentityDocument, type IdentityDocumentReading } from '../services/DocumentReader';
import { cropToFile } from '../utils/cropToFile';
import { GUIDE_RADIUS, cropForGuide, guideBox } from '../utils/guide';

export { cropForGuide, guideBox } from '../utils/guide';
import { detectDocumentWithOpenCV, frameToProcessingBuffer } from '../core/OpenCVFrameProcessor';
import { useDocumentDetection, type DetectionUpdate } from '../hooks/useDocumentDetection';
import { toFileUri } from '../utils/fileUri';
import type { VerifiedDocType } from '../types/extraction';

// ============================================================================
// Types
// ============================================================================

/** What the scan is doing, for the host's copy: the camera starting, looking, the document found, the photo being taken */
export type DocumentScanStatus = 'starting' | 'searching' | 'found' | 'capturing';

export interface DocumentScanResult {
  /** The photo cropped to the frame guide (file://) */
  uri: string;
  /** The whole photo (file://) */
  originalUri: string;
  /** What the `mrz` check read off the photo: valid, every check digit passed. Absent for the other checks */
  reading?: IdentityDocumentReading;
}

/**
 * What a photo taken on its own must hold to be handed back; under it the photo is dropped and the scan goes on:
 * - `mrz`: a valid MRZ, every check digit passing (a passport's data page, an ID card's back). Nothing else passes,
 *   and the photo is sure to be readable
 * - `text`: lines of a document's text (`minTextLines`), for a side without an MRZ
 * - `none`: the outline alone
 */
export type DocumentPhotoCheck = 'mrz' | 'text' | 'none';

export interface DocumentScanError {
  /** `CAMERA_FAILED`: the camera stopped on its own (in use by another app, a call, the system) */
  code: 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAMERA_FAILED' | 'CAPTURE_FAILED';
  message: string;
}

export interface DocumentScanViewProps {
  /** `passport` frames an upright passport page; anything else an ID-1 card */
  docType: VerifiedDocType;
  style?: StyleProp<ViewStyle>;
  /** Pause the camera (e.g. while another screen covers it). Default true */
  isActive?: boolean;
  /** Take the photo on its own once the document holds still. Default true */
  autoCapture?: boolean;
  /** Corner radius of the viewport. Default 24 */
  borderRadius?: number;
  /** The guide's colour once the document is found. Default '#55D4C9' */
  accentColor?: string;
  /** The guide's colour while looking. Default '#FFFFFF' */
  guideColor?: string;
  /** JPEG quality of the cropped photo (0-1). Default 0.9 */
  quality?: number;
  /**
   * What a photo taken on its own must hold to be handed back (see {@link DocumentPhotoCheck}). The manual shutter
   * (`capture()`) is never checked. Default `mrz` for a passport, `text` otherwise
   */
  photoCheck?: DocumentPhotoCheck;
  /** Lines of text the `text` check asks for: a document's, not a door or a screen with the same outline. Default 4 */
  minTextLines?: number;
  onStatusChange?: (status: DocumentScanStatus) => void;
  /**
   * A photo taken on its own was dropped by the check, with how many in a row: after a few, the host can suggest the
   * manual shutter (poor light, glare, a side the recognizer can't read)
   */
  onPhotoRejected?: (rejectedInARow: number) => void;
  onCapture: (result: DocumentScanResult) => void;
  onError?: (error: DocumentScanError) => void;
}

export interface DocumentScanViewRef {
  /** Takes the photo now (a manual shutter); ignored while one is being taken */
  capture: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * The multi-lens (virtual) back camera where the phone has one: like the system camera app, the phone then
 * switches to the ultra-wide lens by itself to focus up close (the main lens can't focus nearer than ~20 cm on
 * recent iPhones). Falls back to a dual or single lens.
 */
const DEVICE_FILTER = { physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'] } as const;

const FRAME_PROCESSING = {
  /** Look for the document about 6 times a second, whatever the camera's frame rate (30 or 60 fps) */
  INTERVAL_MS: 160,
  TARGET_RESOLUTION: { width: 1280, height: 720 },
  PROCESSING_LONG_SIDE: 480,
};

/** A line of a document: a word or a number of 3 characters at least, not a speck the recognizer read as a letter */
const TEXT_LINE = /[A-Za-z0-9\u00C0-\u024F\u0600-\u06FF]{3,}/;

// ============================================================================
// Helpers
// ============================================================================

/** Deletes a photo the scan won't hand back: a dropped attempt would otherwise stay in the cache */
function discard(...uris: string[]): void {
  for (const uri of uris) {
    try {
      new File(uri).delete();
    } catch {
      // Already gone
    }
  }
}

/**
 * Whether the photo holds a document's text, read on the device. An app built before the recognizer was added has no
 * way to tell: its photo is taken as it is.
 */
async function checkPhoto(
  uri: string,
  check: DocumentPhotoCheck,
  minLines: number
): Promise<{ passed: boolean; reading?: IdentityDocumentReading }> {
  const recognizer = documentTextRecognizer();
  if (check === 'none' || !recognizer) return { passed: true };
  try {
    if (check === 'mrz') {
      const reading = await readIdentityDocument(uri);
      return reading.isValid ? { passed: true, reading } : { passed: false };
    }
    const lines = await recognizer.recognize(uri);
    return { passed: lines.filter((line) => TEXT_LINE.test(line.text)).length >= minLines };
  } catch {
    // The recognizer failed on this photo: not a document as far as this attempt can tell, the next one tries again
    return { passed: false };
  }
}


// ============================================================================
// Component
// ============================================================================

export const DocumentScanView = forwardRef<DocumentScanViewRef, DocumentScanViewProps>(function DocumentScanView(
  {
    docType,
    style,
    isActive = true,
    autoCapture = true,
    borderRadius = 24,
    accentColor = '#55D4C9',
    guideColor = '#FFFFFF',
    quality = 0.9,
    photoCheck,
    minTextLines = 4,
    onStatusChange,
    onPhotoRejected,
    onCapture,
    onError,
  },
  ref
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);

  const check: DocumentPhotoCheck = photoCheck ?? (docType === 'passport' ? 'mrz' : 'text');
  const camera = useCameraAccess('back', isActive, { physicalDevices: [...DEVICE_FILTER.physicalDevices] });
  const { device, hasPermission } = camera;
  // A virtual device with an ultra-wide lens starts on it (zoom 1): its first switch factor is the main lens's view, the
  // framing of a single camera. Without one (a wide + telephoto pair, iPhone 7 Plus to XS) that factor is the
  // telephoto's: stay at 1, the main lens
  const zoom = device?.physicalDevices.some((lens) => lens.type === 'ultra-wide-angle') ? device.zoomLensSwitchFactors[0] : undefined;
  // About 11 MP (2880 × 3840) at most: sharp enough for an MRZ, without a 48 or 200 MP sensor's full photo to crop,
  // read and send
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality', targetResolution: CommonResolutions.UHD_4_3 });

  // Detection: a shape held steady is enough (the host reads the photo itself)
  const detectionConfig = useMemo(() => ({ requireOcrValidation: false }), []);
  const { isShapeDetected, shouldAutoCapture, onCaptureTriggered, updateDetection, resetDetection } = useDocumentDetection(
    isCameraReady,
    captureInProgress,
    !autoCapture,
    detectionConfig
  );
  const updateDetectionRef = useRef(updateDetection);
  updateDetectionRef.current = updateDetection;
  const forwardDetection = useCallback((detection: DetectionUpdate) => {
    updateDetectionRef.current(detection);
  }, []);

  const guide = useMemo(() => (size ? guideBox(size.width, size.height, docType) : null), [size, docType]);
  // Plain numbers for the frame worklet
  const viewWidth = size?.width ?? 0;
  const viewHeight = size?.height ?? 0;
  const guideWidth = guide?.width ?? 0;
  const guideHeight = guide?.height ?? 0;

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';

      try {
        const runtime = globalThis as unknown as { __documentScanLastAt?: number };
        const now = Date.now();
        if (guideWidth === 0) return;
        if (now - (runtime.__documentScanLastAt ?? 0) < FRAME_PROCESSING.INTERVAL_MS) {
          return;
        }
        runtime.__documentScanLastAt = now;
        const processed = frameToProcessingBuffer(frame, FRAME_PROCESSING.PROCESSING_LONG_SIDE);
        if (processed === null) {
          return;
        }
        const detection = detectDocumentWithOpenCV(
          processed.buffer,
          processed.width,
          processed.height,
          frame.width,
          frame.height,
          docType,
          {},
          {
            sideways: frame.orientation === 'left' || frame.orientation === 'right',
            view: { width: viewWidth, height: viewHeight },
            guide: { width: guideWidth, height: guideHeight },
          }
        );
        scheduleOnRN(forwardDetection, {
          isDetected: detection.isDetected,
          corners: detection.corners,
          confidence: detection.confidence,
        });
      } catch (error) {
        scheduleOnRN(forwardDetection, { isDetected: false, corners: null, confidence: 0 });
      } finally {
        frame.dispose();
      }
    },
    [docType, forwardDetection, guideHeight, guideWidth, viewHeight, viewWidth]
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: FRAME_PROCESSING.TARGET_RESOLUTION,
    onFrame,
    onFrameDropped: () => undefined,
  });
  const outputs = useMemo(
    () => (autoCapture ? [photoOutput, frameOutput] : [photoOutput]),
    [autoCapture, photoOutput, frameOutput]
  );

  // Callbacks read through refs: a photo taken just as the screen closes, or the camera pauses, is never handed back
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const activeRef = useRef(camera.isActive);
  activeRef.current = camera.isActive;
  const callbacksRef = useRef({ onCapture, onError, onPhotoRejected });
  callbacksRef.current = { onCapture, onError, onPhotoRejected };
  // One photo at a time, the manual shutter and the automatic one alike (the state lags a render behind)
  const busyRef = useRef(false);
  const rejectedRef = useRef(0);

  // Takes the photo; one taken on its own (`checked`) is handed back only if it holds what the document holds
  const takePhoto = useCallback(async (checked: boolean) => {
    if (busyRef.current || !isCameraReady || !size || !guide) return;
    busyRef.current = true;
    setCaptureInProgress(true);
    onCaptureTriggered();
    try {
      // An attempt the check may drop makes no sound: the host marks the photo it keeps (a haptic, a tick)
      const photo = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: !checked }, {});
      const originalUri = toFileUri(photo.filePath);
      const saved = await cropToFile(originalUri, (width, height) => cropForGuide(width, height, size.width, size.height, guide), quality);
      const verdict = checked ? await checkPhoto(saved.uri, check, minTextLines) : { passed: true };
      if (!mountedRef.current || !activeRef.current) {
        discard(saved.uri, originalUri);
        return;
      }
      if (!verdict.passed) {
        // An outline like a document's, without what the document holds: keep looking, held steady again from the start
        discard(saved.uri, originalUri);
        rejectedRef.current += 1;
        callbacksRef.current.onPhotoRejected?.(rejectedRef.current);
        resetDetection();
        return;
      }
      rejectedRef.current = 0;
      callbacksRef.current.onCapture({ uri: saved.uri, originalUri, ...(verdict.reading ? { reading: verdict.reading } : {}) });
    } catch (error) {
      if (mountedRef.current && activeRef.current) {
        callbacksRef.current.onError?.({ code: 'CAPTURE_FAILED', message: error instanceof Error ? error.message : String(error) });
      }
      resetDetection();
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setCaptureInProgress(false);
    }
  }, [check, guide, isCameraReady, minTextLines, onCaptureTriggered, photoOutput, quality, resetDetection, size]);

  const capture = useCallback(() => takePhoto(false), [takePhoto]);
  useImperativeHandle(ref, () => ({ capture }), [capture]);

  useEffect(() => {
    if (shouldAutoCapture) void takePhoto(true);
  }, [shouldAutoCapture, takePhoto]);

  const status: DocumentScanStatus = !isCameraReady
    ? 'starting'
    : captureInProgress
      ? 'capturing'
      : isShapeDetected
        ? 'found'
        : 'searching';
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (camera.problem === 'PERMISSION_DENIED') onError?.({ code: 'PERMISSION_DENIED', message: 'Camera permission is not granted' });
    else if (camera.problem === 'NO_CAMERA') onError?.({ code: 'NO_CAMERA', message: 'No back camera on this device' });
  }, [camera.problem, onError]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (current?.width === width && current.height === height ? current : { width, height }));
  }, []);

  const found = status === 'found' || status === 'capturing';

  return (
    <View style={[styles.container, { borderRadius }, style]} onLayout={handleLayout}>
      {hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={camera.isActive}
          outputs={outputs}
          zoom={zoom}
          // Tap to focus, when the automatic focus picks the wrong thing
          enableNativeTapToFocusGesture
          resizeMode="cover"
          onStarted={() => setIsCameraReady(true)}
          onStopped={() => setIsCameraReady(false)}
          onError={(error) => onError?.({ code: 'CAMERA_FAILED', message: error.message })}
        />
      ) : null}
      {size && guide ? (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="documentScanGuide">
              <Rect x={0} y={0} width={size.width} height={size.height} fill="white" />
              <Rect x={guide.x} y={guide.y} width={guide.width} height={guide.height} rx={GUIDE_RADIUS} fill="black" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill="rgba(0,0,0,0.45)" mask="url(#documentScanGuide)" />
          <Rect
            x={guide.x}
            y={guide.y}
            width={guide.width}
            height={guide.height}
            rx={GUIDE_RADIUS}
            fill="transparent"
            stroke={found ? accentColor : guideColor}
            strokeWidth={found ? 3 : 2}
            strokeDasharray={found ? undefined : '8,6'}
          />
        </Svg>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#1F2235',
  },
});

export default DocumentScanView;
