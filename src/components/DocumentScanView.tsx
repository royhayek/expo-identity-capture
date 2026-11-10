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
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Camera, CommonResolutions, useFrameOutput, usePhotoOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { useCameraAccess } from '../hooks/useCameraAccess';
import { documentTextRecognizer, holdsDocumentText } from '../core/DocumentTextRecognizer';
import { readIdentityDocument, type IdentityDocumentReading } from '../services/DocumentReader';
import { cropToFile } from '../utils/cropToFile';
import { CROP_MARGIN, FRAME_RESOLUTION, GUIDE_RADIUS, cropForGuide, guideBox } from '../utils/guide';

export { cropForGuide, guideBox } from '../utils/guide';
import { detectDocumentWithOpenCV, frameGuidePixels, frameToProcessingBuffer, type GuidePixels } from '../core/OpenCVFrameProcessor';
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
  /**
   * What the `mrz` check read off the photo: valid, every check digit passed. Absent for the other checks, and when the
   * photo's MRZ didn't read (the host reads the photo itself then)
   */
  reading?: IdentityDocumentReading;
}

/**
 * What the document must show before the photo is taken on its own. It is read on the live camera, silently: the
 * shutter only goes off for a document it read, and a photo taken is always handed back.
 * - `mrz`: a document's text or its MRZ, then the photo's MRZ read with its check digits (`reading`, when they pass)
 * - `text`: a document's text (`minTextLines` lines) or an MRZ, for a side without one
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
  /** The guide's colour once the document is seen (dashed, while it is held still) and found (solid). Default '#55D4C9' */
  accentColor?: string;
  /** The guide's colour while looking. Default '#FFFFFF' */
  guideColor?: string;
  /** JPEG quality of the cropped photo (0-1). Default 0.9 */
  quality?: number;
  /**
   * What the document must show before the photo is taken on its own (see {@link DocumentPhotoCheck}). The manual
   * shutter (`capture()`) is never checked. Default `mrz` for a passport, `text` otherwise
   */
  photoCheck?: DocumentPhotoCheck;
  /** Lines of text the `text` check asks for: a document's, not a door or a screen with the same outline. Default 4 */
  minTextLines?: number;
  onStatusChange?: (status: DocumentScanStatus) => void;
  /**
   * The document held still but its text didn't read (no photo was taken), with how many times in a row: after a few,
   * the host can suggest the manual shutter (poor light, glare, a side the recognizer can't read)
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
 * recent iPhones). Falls back to a dual or single lens. iOS only: Android lists its lenses as cameras of their own,
 * and the filter could pick an ultra-wide one alone (often fixed-focus, the card small and soft in its frames); the
 * default back camera is the main lens there
 */
const DEVICE_FILTER: Parameters<typeof useCameraAccess>[2] =
  Platform.OS === 'ios' ? { physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'] } : undefined;
/** The orientation flag of frames upright once turned clockwise (see frameGuidePixels) */
const CLOCKWISE_FLAG = Platform.OS === 'android' ? 'left' : 'right';
/**
 * Times the document may hold still without its text reading before the photo is taken anyway: some sides can't be
 * read on some phones (ML Kit on Android reads no Arabic, its model may still be downloading), and the outline held
 * still in the guide that many times is a document
 */
const MAX_UNREAD = 2;

const FRAME_PROCESSING = {
  /** Look for the document about 6 times a second, whatever the camera's frame rate (30 or 60 fps) */
  INTERVAL_MS: 160,
  TARGET_RESOLUTION: FRAME_RESOLUTION,
  PROCESSING_LONG_SIDE: 480,
  /** The longest the camera may take to hand over the frame to read before the attempt is given up (ms) */
  PROBE_TIMEOUT_MS: 3000,
};

/** The frame read before the photo, as an image file: through react-native-nitro-image, null where it isn't installed */
type FrameImages = { loadFromRawPixelData: (data: GuidePixels) => { saveToTemporaryFileAsync: (format: 'jpg', quality: number) => Promise<string> } };
let frameImages: FrameImages | null | undefined;
function frameImageFactory(): FrameImages | null {
  if (frameImages === undefined) {
    try {
      frameImages = (require('react-native-nitro-image') as { Images: FrameImages }).Images;
    } catch {
      frameImages = null;
    }
  }
  return frameImages;
}

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

/** The frame's crop read the other way up: the frame's orientation flag read wrong on this phone */
async function turnedOver(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri).rotate(180);
  const image = await context.renderAsync();
  context.release();
  try {
    return (await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG })).uri;
  } finally {
    image.release();
  }
}

/** Whether an image holds a document's text (lines, or an MRZ), read on the device */
async function holdsDocument(uri: string, minLines: number): Promise<{ passed: boolean; lines: number }> {
  const recognizer = documentTextRecognizer();
  if (!recognizer) return { passed: true, lines: 0 };
  const lines = await recognizer.recognize(uri);
  return { passed: holdsDocumentText(lines, minLines), lines: lines.length };
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
  const camera = useCameraAccess('back', isActive, DEVICE_FILTER);
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
  const { isShapeDetected, detectedCorners, shouldAutoCapture, onCaptureTriggered, updateDetection, resetDetection } = useDocumentDetection(
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

  // The frame to read before the photo: asked by its id (unique across mounts, the worklet runtime may outlive one), the
  // next frame answers it once
  const [probeId, setProbeId] = useState(0);
  const probeRef = useRef<{ id: number; resolve: (pixels: GuidePixels | null) => void } | null>(null);
  const answerProbe = useCallback((id: number, pixels: GuidePixels | null) => {
    if (probeRef.current?.id !== id) return;
    probeRef.current.resolve(pixels);
    probeRef.current = null;
  }, []);

  const logFrame = useCallback((line: string) => console.log(`[DocumentScan] frames ${line}`), []);
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';

      try {
        const runtime = globalThis as unknown as { __documentScanLastAt?: number };
        const now = Date.now();
        if (guideWidth === 0) return;
        // Development builds only: what the camera hands over, once, to check a phone's frames
        if (__DEV__ && (runtime as unknown as { __documentScanLogged?: number }).__documentScanLogged !== viewWidth * guideWidth) {
          (runtime as unknown as { __documentScanLogged?: number }).__documentScanLogged = viewWidth * guideWidth;
          scheduleOnRN(logFrame, `${frame.width}x${frame.height} ${frame.pixelFormat} orientation=${frame.orientation} planar=${frame.isPlanar} pixels=${frame.hasPixelBuffer} view=${viewWidth}x${viewHeight} guide=${guideWidth.toFixed(0)}x${guideHeight.toFixed(0)}`);
        }
        const probing = runtime as unknown as { __documentScanProbed?: number };
        if (probeId !== 0 && probing.__documentScanProbed !== probeId) {
          probing.__documentScanProbed = probeId;
          const pixels = frameGuidePixels(frame, { view: { width: viewWidth, height: viewHeight }, guide: { width: guideWidth, height: guideHeight } }, CROP_MARGIN, CLOCKWISE_FLAG);
          scheduleOnRN(answerProbe, probeId, pixels);
          return;
        }
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
        // Development builds only, every 2 s at most: a frame that can't be read reads as no document, and Android's
        // frames once failed on every one without a trace
        const failures = globalThis as unknown as { __documentScanFailedAt?: number };
        if (__DEV__ && Date.now() - (failures.__documentScanFailedAt ?? 0) > 2000) {
          failures.__documentScanFailedAt = Date.now();
          scheduleOnRN(logFrame, `failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        scheduleOnRN(forwardDetection, { isDetected: false, corners: null, confidence: 0 });
      } finally {
        frame.dispose();
      }
    },
    [answerProbe, docType, forwardDetection, logFrame, guideHeight, guideWidth, probeId, viewHeight, viewWidth]
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

  // Whether the document is still held in the guide, read once the frame is: it may have moved away meanwhile
  const shapeDetectedRef = useRef(isShapeDetected);
  shapeDetectedRef.current = isShapeDetected;
  // Which way up the frame's crop reads on this phone: turned over once it read only that way
  const turnedOverRef = useRef(false);

  /** A frame of the guide, as an image file, read before the photo; null when the camera didn't hand one over */
  const probeFrame = useCallback(async (): Promise<string | null> => {
    const images = frameImageFactory();
    if (!images) return null;
    const pixels = await new Promise<GuidePixels | null>((resolve) => {
      const id = Date.now();
      probeRef.current = { id, resolve };
      setProbeId(id);
      setTimeout(() => answerProbe(id, null), FRAME_PROCESSING.PROBE_TIMEOUT_MS);
    });
    if (!pixels) return null;
    const path = await images.loadFromRawPixelData(pixels).saveToTemporaryFileAsync('jpg', 90);
    return toFileUri(path);
  }, [answerProbe]);

  /**
   * Whether the document in the guide reads as one, on the live camera and without a sound: the photo is taken only
   * then, never one to be dropped. Where the frame can't be read (the recognizer or nitro-image missing, the camera
   * not handing it over), the outline held still is enough
   */
  const documentReads = useCallback(async (): Promise<boolean> => {
    if (check === 'none' || !documentTextRecognizer()) return true;
    const frameUri = await probeFrame().catch((error: unknown) => {
      // The frame couldn't be made an image: as without a frame, never a photo held back (the error left the scan
      // locking and failing in a loop)
      if (__DEV__) console.log(`[DocumentScan] frame not saved: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!frameUri) {
      if (__DEV__) console.log('[DocumentScan] no frame to read before the photo: taken on the outline alone');
      return true;
    }
    const files = [frameUri];
    try {
      const first = turnedOverRef.current ? await turnedOver(frameUri) : frameUri;
      files.push(first);
      let verdict = await holdsDocument(first, minTextLines);
      if (!verdict.passed) {
        // Read the other way up once: a phone whose frames are flagged the other way round reads nothing upright
        const other = turnedOverRef.current ? frameUri : await turnedOver(frameUri);
        files.push(other);
        const again = await holdsDocument(other, minTextLines);
        if (again.passed) turnedOverRef.current = !turnedOverRef.current;
        verdict = again.passed ? again : verdict;
      }
      // Development builds only: what the frame read, without what it says
      if (__DEV__) {
        console.log(`[DocumentScan] frame ${verdict.passed ? 'read' : 'not read'}: ${verdict.lines} lines, ${minTextLines} asked, turned over ${turnedOverRef.current}`);
      }
      return verdict.passed;
    } catch (error) {
      // The recognizer failed, which says nothing of the document (ML Kit's model still downloading on Android, the
      // first time): as without a recognizer, the outline held still is enough. Only a reading without text holds the
      // photo back
      if (__DEV__) console.log(`[DocumentScan] frame not read, taken on the outline alone: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    } finally {
      discard(...new Set(files));
    }
  }, [check, minTextLines, probeFrame]);

  // Takes the photo and hands it back. On its own (`automatic`), only once the document read on the live camera
  const takePhoto = useCallback(async (automatic: boolean) => {
    if (busyRef.current || !isCameraReady || !size || !guide) return;
    busyRef.current = true;
    onCaptureTriggered();
    try {
      if (automatic) {
        // Held still unread too many times already: a side this phone can't read, taken as it is
        const reads = rejectedRef.current >= MAX_UNREAD || (await documentReads());
        if (!mountedRef.current || !activeRef.current) return;
        if (!reads || !shapeDetectedRef.current) {
          // An outline like a document's, its text not read (or moved away meanwhile): keep looking, no photo taken
          if (!reads) {
            rejectedRef.current += 1;
            callbacksRef.current.onPhotoRejected?.(rejectedRef.current);
          }
          resetDetection();
          return;
        }
      }
      setCaptureInProgress(true);
      const photo = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      const originalUri = toFileUri(photo.filePath);
      const saved = await cropToFile(originalUri, (width, height) => cropForGuide(width, height, size.width, size.height, guide), quality);
      // The MRZ read off the photo, kept when every check digit passes: the photo is handed back either way
      const reading = automatic && check === 'mrz' ? await readIdentityDocument(saved.uri).catch(() => null) : null;
      if (!mountedRef.current || !activeRef.current) {
        discard(saved.uri, originalUri);
        return;
      }
      rejectedRef.current = 0;
      callbacksRef.current.onCapture({ uri: saved.uri, originalUri, ...(reading?.isValid ? { reading } : {}) });
    } catch (error) {
      if (__DEV__) console.log(`[DocumentScan] photo failed: ${error instanceof Error ? error.message : String(error)}`);
      if (mountedRef.current && activeRef.current) {
        callbacksRef.current.onError?.({ code: 'CAPTURE_FAILED', message: error instanceof Error ? error.message : String(error) });
      }
      resetDetection();
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setCaptureInProgress(false);
    }
  }, [check, documentReads, guide, isCameraReady, onCaptureTriggered, photoOutput, quality, resetDetection, size]);

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
  // In the guide, not held still long enough yet: the guide lights up at once, so the customer knows to hold it there
  const seen = found || (status === 'searching' && detectedCorners !== null);

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
        </Svg>
      ) : null}
      {size && guide ? (
        // An Svg of its own, made again for each look: react-native-svg doesn't redraw a shape next to a mask when only
        // its stroke changes, nor drop a dash pattern set back to none, so the guide stayed white and dashed
        <Svg
          key={found ? 'found' : seen ? 'seen' : 'searching'}
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none">
          <Rect
            x={guide.x}
            y={guide.y}
            width={guide.width}
            height={guide.height}
            rx={GUIDE_RADIUS}
            fill="none"
            stroke={seen ? accentColor : guideColor}
            strokeWidth={found ? 3 : 2}
            {...(found ? {} : { strokeDasharray: '8,6' })}
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
