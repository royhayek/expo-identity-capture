/**
 * Custom Hook for Document Detection
 *
 * Manages document detection state, stability tracking, and auto-capture logic.
 * Separates detection concerns from camera UI for better maintainability.
 *
 * @module useDocumentDetection
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { DetectedDocumentCorners } from '../core/OpenCVFrameProcessor';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Detection state update payload */
export interface DetectionUpdate {
  isDetected: boolean;
  corners: DetectedDocumentCorners | null;
  confidence: number;
}

/** OCR validation state */
export interface OcrValidationState {
  isValidating: boolean;
  isValidDocument: boolean;
  lastValidationTime: number;
  validationCount: number;
}

/** Configuration for document detection behavior */
export interface DocumentDetectionConfig {
  /** Number of stable frames required for stable detection (a few missed ones in between are forgiven) */
  stableFramesRequired: number;
  /**
   * Frames in a row without the document that don't lose it: edge detection misses frames of a hand-held card (a thumb
   * over an edge, glare, motion blur), and starting over on each would keep a customer holding still for many seconds
   */
  maxMissedFrames: number;
  /** Maximum pixel distance for corners to be considered stable */
  stabilityThreshold: number;
  /** Minimum confidence for auto-capture (0-1) */
  autoCaptureConfidence: number;
  /** Delay after camera ready before detection starts (ms) */
  autoCaptureDelay: number;
  /** Cooldown after document detected before auto-capture can trigger (ms) */
  captureHoldTime: number;
  /** Delay before resetting auto-capture flag after detection lost (ms) */
  resetDelay: number;
  /** Whether OCR validation is required for auto-capture */
  requireOcrValidation: boolean;
  /** Minimum time between OCR validation attempts (ms) */
  ocrValidationInterval: number;
  /** Number of successful OCR validations required before auto-capture */
  ocrValidationsRequired: number;
}

/** Return type of the useDocumentDetection hook */
export interface UseDocumentDetectionReturn {
  /** Whether a shape is stably detected (for triggering OCR) - internal use */
  isShapeDetected: boolean;
  /** Whether document is validated by OCR and ready for capture - use this for UI */
  isDocumentValid: boolean;
  /** Current detected corners (may be unstable) */
  detectedCorners: DetectedDocumentCorners | null;
  /** Detection confidence score (0-1) */
  detectionConfidence: number;
  /** Whether auto-capture should trigger */
  shouldAutoCapture: boolean;
  /** Whether OCR validation should be performed */
  shouldPerformOcrValidation: boolean;
  /** OCR validation state */
  ocrValidationState: OcrValidationState;
  /** Call this when capture is triggered */
  onCaptureTriggered: () => void;
  /** Call this to update detection state from frame processor */
  updateDetection: (update: DetectionUpdate) => void;
  /** Call this when OCR validation completes */
  onOcrValidationComplete: (isValid: boolean) => void;
  /** Reset detection state */
  resetDetection: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default detection configuration */
const DEFAULT_CONFIG: DocumentDetectionConfig = {
  stableFramesRequired: 6,       // About 1 s of the document held still, at 6 frames analysed a second
  maxMissedFrames: 3,            // About 0.5 s without it before it counts as gone
  stabilityThreshold: 40,        // Average corner shift between processed frames, in frame pixels (about 3% of 1280)
  autoCaptureConfidence: 0.75,   // Require 75% confidence for shape detection
  autoCaptureDelay: 500,        // Wait 0.5 second after camera ready before detection starts
  captureHoldTime: 200,         // A moment more once stable, before the photo
  resetDelay: 1500,
  requireOcrValidation: true,    // Require OCR validation before auto-capture
  ocrValidationInterval: 1000,   // Not used anymore - OCR runs once
  ocrValidationsRequired: 1,     // Only need 1 successful OCR validation - capture immediately after
};

/** Where the document stands across frames: how long it has held still, and since when it is missing */
export interface DocumentTrack {
  /** Good frames since it was found, or last moved */
  hits: number;
  /** Frames in a row without it */
  misses: number;
  /** Where it was last seen; null once lost */
  corners: DetectedDocumentCorners | null;
}

export const EMPTY_TRACK: DocumentTrack = { hits: 0, misses: 0, corners: null };

type TrackConfig = Pick<DocumentDetectionConfig, 'autoCaptureConfidence' | 'stabilityThreshold' | 'maxMissedFrames'>;

/**
 * The track after one analysed frame. A missed or doubtful frame only pauses the count; a few in a row lose the
 * document. A document that moved starts its count over
 */
export function trackDocument(track: DocumentTrack, detection: DetectionUpdate, cfg: TrackConfig): DocumentTrack {
  const corners = detection.isDetected ? detection.corners : null;
  if (corners === null || detection.confidence < cfg.autoCaptureConfidence) {
    const misses = track.misses + 1;
    return misses > cfg.maxMissedFrames ? EMPTY_TRACK : { ...track, misses };
  }
  const previous = track.corners;
  // Held steady: the corners stay where they were; a shape that jumps is a new one, its count starts over
  const shift = previous
    ? (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).reduce(
        (sum, corner) => sum + Math.hypot(corners[corner].x - previous[corner].x, corners[corner].y - previous[corner].y),
        0
      ) / 4
    : 0;
  return { hits: shift > cfg.stabilityThreshold ? 1 : track.hits + 1, misses: 0, corners };
}

/** Debug logging */
const DEBUG_LOGGING = __DEV__ ?? false;
/** Development builds only: a release build logs nothing, on every processed frame least of all */
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGGING) console.log(...args);
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Custom hook for managing document detection state
 *
 * Features:
 * - Stability tracking (requires consecutive stable detections)
 * - Auto-capture logic with configurable delay
 * - Confidence-based filtering
 * - Auto-reset when detection is lost
 *
 * @param isCameraReady - Whether the camera is initialized
 * @param captureInProgress - Whether a capture is currently in progress
 * @param disableDetection - Whether detection is disabled
 * @param config - Optional configuration overrides
 */
export function useDocumentDetection(
  isCameraReady: boolean,
  captureInProgress: boolean,
  disableDetection: boolean,
  config: Partial<DocumentDetectionConfig> = {}
): UseDocumentDetectionReturn {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // State
  const [isShapeDetected, setIsShapeDetected] = useState(false); // Shape detected by OpenCV
  const [isDocumentValid, setIsDocumentValid] = useState(false); // OCR validated - ready for capture
  const [detectedCorners, setDetectedCorners] = useState<DetectedDocumentCorners | null>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [shouldAutoCapture, setShouldAutoCapture] = useState(false);
  const [isAutoCaptureEnabled, setIsAutoCaptureEnabled] = useState(false);
  const [isCaptureReady, setIsCaptureReady] = useState(false); // True after hold time expires
  const [shouldPerformOcrValidation, setShouldPerformOcrValidation] = useState(false);
  const [ocrValidationState, setOcrValidationState] = useState<OcrValidationState>({
    isValidating: false,
    isValidDocument: false,
    lastValidationTime: 0,
    validationCount: 0,
  });

  // Refs for tracking
  const autoCaptureTriggeredRef = useRef(false);
  const ocrValidationCountRef = useRef(0);
  const detectionStartTimeRef = useRef<number | null>(null);

  // Enable auto-capture after delay when camera becomes ready
  useEffect(() => {
    if (!isCameraReady || disableDetection) {
      setIsAutoCaptureEnabled(false);
      return;
    }

    if (DEBUG_LOGGING) {
      debugLog('[Detection] Camera ready, starting auto-capture delay...');
    }

    const timeout = setTimeout(() => {
      if (DEBUG_LOGGING) {
        debugLog('[Detection] Auto-capture now enabled');
      }
      setIsAutoCaptureEnabled(true);
    }, cfg.autoCaptureDelay);

    return () => clearTimeout(timeout);
  }, [isCameraReady, disableDetection, cfg.autoCaptureDelay]);

  // Ref to track if OCR has already been performed for this detection session
  const ocrPerformedRef = useRef(false);

  // Reset everything when detection is lost
  useEffect(() => {
    if (!isShapeDetected) {
      // Immediately reset all validation state when shape detection is lost
      ocrValidationCountRef.current = 0;
      detectionStartTimeRef.current = null;
      ocrPerformedRef.current = false; // Reset OCR flag so it can run again next time
      setIsCaptureReady(false);
      setIsDocumentValid(false); // Reset valid state - no more green
      setShouldPerformOcrValidation(false);
      setOcrValidationState({
        isValidating: false,
        isValidDocument: false,
        lastValidationTime: 0,
        validationCount: 0,
      });

      const timeout = setTimeout(() => {
        autoCaptureTriggeredRef.current = false;
        setShouldAutoCapture(false);
      }, cfg.resetDelay);
      return () => clearTimeout(timeout);
    }
  }, [isShapeDetected, cfg.resetDelay]);

  // Capture hold time - wait for document to be held steady before allowing capture
  useEffect(() => {
    if (!isShapeDetected) {
      return;
    }

    // Record when detection started
    if (detectionStartTimeRef.current === null) {
      detectionStartTimeRef.current = Date.now();
      debugLog(`[Detection] Document detected, starting ${cfg.captureHoldTime}ms hold timer...`);
    }

    // Set timer to enable capture after hold time
    const holdTimeout = setTimeout(() => {
      debugLog(`[Detection] ✅ Hold time complete, capture ready`);
      setIsCaptureReady(true);
    }, cfg.captureHoldTime);

    return () => clearTimeout(holdTimeout);
  }, [isShapeDetected, cfg.captureHoldTime]);

  // Trigger OCR validation ONCE after hold time completes
  // OCR runs only once per detection session to minimize API costs
  useEffect(() => {
    if (!isCaptureReady || !cfg.requireOcrValidation || disableDetection || ocrPerformedRef.current) {
      return;
    }

    // Mark OCR as performed for this session
    ocrPerformedRef.current = true;

    debugLog(`[Detection] 📝 Requesting OCR validation (runs once)...`);
    setShouldPerformOcrValidation(true);
    setOcrValidationState(prev => ({
      ...prev,
      isValidating: true,
      lastValidationTime: Date.now(),
    }));
  }, [
    isCaptureReady,
    cfg.requireOcrValidation,
    disableDetection,
  ]);

  // Determine if auto-capture should trigger
  useEffect(() => {
    if (DEBUG_LOGGING && isDocumentValid) {
      debugLog(`[Detection] Checking auto-capture conditions:`, {
        isDocumentValid,
        isCaptureReady,
        disableDetection,
        isCameraReady,
        isAutoCaptureEnabled,
        captureInProgress,
        autoCaptureTriggered: autoCaptureTriggeredRef.current,
      });
    }

    // Auto-capture triggers when the document is validated by OCR (when required) and hold time has passed
    const canAutoCapture =
      (isDocumentValid || !cfg.requireOcrValidation) &&
      isCaptureReady &&      // Hold time has passed
      !disableDetection &&
      isCameraReady &&
      isAutoCaptureEnabled &&
      !captureInProgress &&
      !autoCaptureTriggeredRef.current;

    if (canAutoCapture) {
      debugLog(`[Detection] ✅ Auto-capture triggered!`);
      setShouldAutoCapture(true);
    }
  }, [
    isDocumentValid,
    isCaptureReady,
    cfg.requireOcrValidation,
    disableDetection,
    isCameraReady,
    isAutoCaptureEnabled,
    captureInProgress,
  ]);

  /**
   * Updates detection state with stability tracking
   */
  // The corners and confidence change on every processed frame: state only when a document appears or goes, not a
  // re-render of the camera view six times a second for values the view doesn't draw
  const shownCornersRef = useRef<DetectedDocumentCorners | null>(null);
  const showDetection = useCallback((corners: DetectedDocumentCorners | null, confidence: number) => {
    const appeared = (shownCornersRef.current === null) !== (corners === null);
    shownCornersRef.current = corners;
    if (appeared) {
      setDetectedCorners(corners);
      setDetectionConfidence(confidence);
    }
  }, []);

  const trackRef = useRef<DocumentTrack>(EMPTY_TRACK);
  const updateDetection = useCallback(
    (detection: DetectionUpdate) => {
      if (disableDetection) {
        return;
      }

      const track = trackDocument(trackRef.current, detection, cfg);
      trackRef.current = track;
      // Shown as soon as it is seen, and until it is really gone: the guide doesn't flicker on a missed frame
      showDetection(track.corners, detection.confidence);

      // Don't count detections until auto-capture is enabled (camera warmup period)
      // This prevents capturing random objects when camera first opens
      if (!isAutoCaptureEnabled) {
        trackRef.current = { ...track, hits: 0 };
        return;
      }

      debugLog(`[Detection] Stability: ${track.hits}/${cfg.stableFramesRequired}, missed ${track.misses}, confidence=${detection.confidence.toFixed(2)}`);
      setIsShapeDetected(track.hits >= cfg.stableFramesRequired);
    },
    [disableDetection, isAutoCaptureEnabled, cfg.autoCaptureConfidence, cfg.stableFramesRequired, cfg.stabilityThreshold, cfg.maxMissedFrames, showDetection]
  );

  /**
   * Resets all detection state
   */
  const resetDetection = useCallback(() => {
    trackRef.current = EMPTY_TRACK;
    shownCornersRef.current = null;
    autoCaptureTriggeredRef.current = false;
    ocrValidationCountRef.current = 0;
    detectionStartTimeRef.current = null;
    ocrPerformedRef.current = false; // Reset OCR flag
    setIsShapeDetected(false);
    setIsDocumentValid(false);
    setIsCaptureReady(false);
    setDetectedCorners(null);
    setDetectionConfidence(0);
    setShouldAutoCapture(false);
    setShouldPerformOcrValidation(false);
    setOcrValidationState({
      isValidating: false,
      isValidDocument: false,
      lastValidationTime: 0,
      validationCount: 0,
    });
  }, []);

  /**
   * Called when OCR validation completes
   */
  const onOcrValidationComplete = useCallback((isValid: boolean) => {
    setShouldPerformOcrValidation(false);

    if (isValid) {
      ocrValidationCountRef.current += 1;
      debugLog(`[Detection] ✅ OCR validation passed! Count: ${ocrValidationCountRef.current}/${cfg.ocrValidationsRequired}`);

      // Mark document as valid (green indicator) when we have enough OCR validations
      if (ocrValidationCountRef.current >= cfg.ocrValidationsRequired) {
        debugLog(`[Detection] 🟢 Document is VALID - ready for capture!`);
        setIsDocumentValid(true);
      }
    } else {
      // Reset validation count on failure - document might have moved
      ocrValidationCountRef.current = 0;
      setIsDocumentValid(false);
      debugLog(`[Detection] ❌ OCR validation failed - not a valid document`);
    }

    setOcrValidationState(prev => ({
      ...prev,
      isValidating: false,
      isValidDocument: isValid,
      validationCount: ocrValidationCountRef.current,
    }));
  }, [cfg.ocrValidationsRequired]);

  /**
   * Called when capture is triggered to prevent re-triggering
   */
  const onCaptureTriggered = useCallback(() => {
    autoCaptureTriggeredRef.current = true;
    setShouldAutoCapture(false);
  }, []);

  return {
    isShapeDetected,
    isDocumentValid,
    detectedCorners,
    detectionConfidence,
    shouldAutoCapture,
    shouldPerformOcrValidation,
    ocrValidationState,
    onCaptureTriggered,
    updateDetection,
    onOcrValidationComplete,
    resetDetection,
  };
}

export default useDocumentDetection;
