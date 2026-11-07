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
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
  type Frame,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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
}

export interface DocumentScanError {
  code: 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAPTURE_FAILED';
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
  onStatusChange?: (status: DocumentScanStatus) => void;
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

const FRAME_PROCESSING = {
  FRAME_SKIP: 5,
  TARGET_RESOLUTION: { width: 1280, height: 720 },
  PROCESSING_LONG_SIDE: 480,
};

/** Width / height of the guide: ID-1 card (85.6 × 54 mm), passport page held upright (88 × 125 mm) */
const GUIDE_RATIO = { card: 1.586, passport: 0.704 };
/** Space between the guide and the viewport's edge */
const GUIDE_INSET = 28;
const GUIDE_RADIUS = 16;
/** Extra room kept around the guide when cropping, for the preview and the photo framing differently */
const CROP_MARGIN = 0.06;

// ============================================================================
// Helpers
// ============================================================================

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The guide inside a viewport of the given size */
export function guideBox(viewWidth: number, viewHeight: number, docType: VerifiedDocType): Box {
  const ratio = docType === 'passport' ? GUIDE_RATIO.passport : GUIDE_RATIO.card;
  let width = viewWidth - GUIDE_INSET * 2;
  let height = width / ratio;
  if (height > viewHeight - GUIDE_INSET * 2) {
    height = viewHeight - GUIDE_INSET * 2;
    width = height * ratio;
  }
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}

/**
 * The guide, in the photo's pixels: the preview fills the viewport ("cover"), so the photo is scaled until it
 * covers the viewport and centred; the guide maps back through that, with a margin, kept inside the photo.
 */
export function cropForGuide(photoWidth: number, photoHeight: number, viewWidth: number, viewHeight: number, guide: Box): Box {
  const scale = Math.max(viewWidth / photoWidth, viewHeight / photoHeight);
  const offsetX = (viewWidth - photoWidth * scale) / 2;
  const offsetY = (viewHeight - photoHeight * scale) / 2;
  const marginX = guide.width * CROP_MARGIN;
  const marginY = guide.height * CROP_MARGIN;
  const x = Math.max(0, (guide.x - marginX - offsetX) / scale);
  const y = Math.max(0, (guide.y - marginY - offsetY) / scale);
  const width = Math.min(photoWidth - x, (guide.width + marginX * 2) / scale);
  const height = Math.min(photoHeight - y, (guide.height + marginY * 2) / scale);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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
    onStatusChange,
    onCapture,
    onError,
  },
  ref
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);

  const device = useCameraDevice('back');
  const { hasPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });

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

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';

      try {
        const runtime = globalThis as unknown as { __documentScanFrameCount?: number };
        runtime.__documentScanFrameCount = ((runtime.__documentScanFrameCount ?? 0) + 1) % FRAME_PROCESSING.FRAME_SKIP;
        if (runtime.__documentScanFrameCount !== 0) {
          return;
        }
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
          docType
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
    [docType, forwardDetection]
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

  const guide = useMemo(() => (size ? guideBox(size.width, size.height, docType) : null), [size, docType]);

  const capture = useCallback(async () => {
    if (captureInProgress || !isCameraReady || !size || !guide) return;
    setCaptureInProgress(true);
    onCaptureTriggered();
    try {
      const photo = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      const originalUri = toFileUri(photo.filePath);
      // Rendered with its EXIF orientation applied, so the crop is in what the customer saw
      const image = await ImageManipulator.manipulate(originalUri).renderAsync();
      const crop = cropForGuide(image.width, image.height, size.width, size.height, guide);
      const cropped = await ImageManipulator.manipulate(originalUri)
        .crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height })
        .renderAsync();
      const saved = await cropped.saveAsync({ compress: quality, format: SaveFormat.JPEG });
      onCapture({ uri: saved.uri, originalUri });
    } catch (error) {
      onError?.({ code: 'CAPTURE_FAILED', message: error instanceof Error ? error.message : String(error) });
      resetDetection();
    } finally {
      setCaptureInProgress(false);
    }
  }, [captureInProgress, guide, isCameraReady, onCapture, onCaptureTriggered, onError, photoOutput, quality, resetDetection, size]);

  useImperativeHandle(ref, () => ({ capture }), [capture]);

  useEffect(() => {
    if (shouldAutoCapture) void capture();
  }, [shouldAutoCapture, capture]);

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
    if (!hasPermission) onError?.({ code: 'PERMISSION_DENIED', message: 'Camera permission is not granted' });
    else if (!device) onError?.({ code: 'NO_CAMERA', message: 'No back camera on this device' });
  }, [device, hasPermission, onError]);

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
          isActive={isActive}
          outputs={outputs}
          resizeMode="cover"
          onStarted={() => setIsCameraReady(true)}
          onStopped={() => setIsCameraReady(false)}
          onError={(error) => onError?.({ code: 'NO_CAMERA', message: error.message })}
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
