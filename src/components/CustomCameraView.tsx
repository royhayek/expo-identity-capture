/**
 * CustomCameraView Component
 *
 * A camera view for document capture with real-time OpenCV-based document detection.
 * Features:
 * - Real-time document edge detection using OpenCV
 * - Automatic capture when document is stably detected
 * - Visual feedback with detected corners overlay
 * - Configurable detection and capture behavior
 *
 * @module CustomCameraView
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Platform,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import Svg, { Defs, Rect, Mask, Path } from 'react-native-svg';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
  type Frame,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { recognizeText, getCloudVisionConfig } from '../services/CloudVisionOCR';
import { mvs } from 'react-native-size-matters';

// Internal imports
import { detectDocumentWithOpenCV, frameToProcessingBuffer } from '../core/OpenCVFrameProcessor';
import { useDocumentDetection } from '../hooks/useDocumentDetection';
import { DocumentValidation } from '../utils/documentValidation';
import { scoreLiveness } from '../services/LivenessDetection';
import {
  useLocalizedStrings,
  useBehaviorConfig,
} from '../context/ConfigContext';
import { useThemedStyles, useFrameStyle } from '../utils/theme';
import { toFileUri } from '../utils/fileUri';
import type { VerifiedDocType } from '../types/extraction';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Liveness result passed back with capture */
export interface CapturedImageWithLiveness {
  imageUri: string;
  liveness?: {
    isLive: boolean;
    score: number;
    confidence: number;
    summary: string;
  };
}

interface CustomCameraViewProps {
  /** Type of document being captured */
  docType: VerifiedDocType;
  /** Callback when image is captured */
  onCapture: (imageUri: string, liveness?: CapturedImageWithLiveness['liveness']) => void;
  /** Callback when capture is cancelled */
  onCancel: () => void;
  /** Disable detection (direct capture mode) */
  disableDetection?: boolean;
  /** Enable flash control */
  enableFlash?: boolean;
  /** Enable OCR validation after capture */
  enableOCRValidation?: boolean;
  /** Enable liveness detection to detect screen captures */
  enableLivenessDetection?: boolean;
  /** Block capture if liveness check fails */
  blockOnLivenessFail?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Frame processing configuration */
const FRAME_PROCESSING = {
  /** Process every Nth frame for performance */
  FRAME_SKIP: 5,
  /** Resolution the frame output streams at (the closest the device supports is picked) */
  TARGET_RESOLUTION: { width: 1280, height: 720 },
  /** Longer side of the buffer the detectors run on */
  PROCESSING_LONG_SIDE: 480,
};

/** Debug logging flag */
const DEBUG_LOGGING = __DEV__ ?? false;

// ============================================================================
// Sub-Components
// ============================================================================

/** Arrow left icon for back button */
const ArrowLeftIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#fff',
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.56994 18.8191C9.37994 18.8191 9.18994 18.7491 9.03994 18.5991L2.96994 12.5291C2.67994 12.2391 2.67994 11.7591 2.96994 11.4691L9.03994 5.39914C9.32994 5.10914 9.80994 5.10914 10.0999 5.39914C10.3899 5.68914 10.3899 6.16914 10.0999 6.45914L4.55994 11.9991L10.0999 17.5391C10.3899 17.8291 10.3899 18.3091 10.0999 18.5991C9.95994 18.7491 9.75994 18.8191 9.56994 18.8191Z"
      fill={color}
    />
    <Path
      d="M20.5 12.75H3.67004C3.26004 12.75 2.92004 12.41 2.92004 12C2.92004 11.59 3.26004 11.25 3.67004 11.25H20.5C20.91 11.25 21.25 11.59 21.25 12C21.25 12.41 20.91 12.75 20.5 12.75Z"
      fill={color}
    />
  </Svg>
);

// ============================================================================
// Main Component
// ============================================================================

export const CustomCameraView: React.FC<CustomCameraViewProps> = ({
  docType,
  onCapture,
  onCancel,
  disableDetection = false,
  enableFlash = true,
  enableOCRValidation = false,
  enableLivenessDetection = false,
  blockOnLivenessFail = false,
}) => {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [isFlashEnabled, setIsFlashEnabled] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [livenessScore, setLivenessScore] = useState<number>(1.0);
  const [isLivenessChecking, setIsLivenessChecking] = useState(false);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const instructionScaleAnim = useRef(new Animated.Value(1)).current;
  const lastInstructionRef = useRef<string>('');

  // -------------------------------------------------------------------------
  // Configuration & Styling Hooks
  // -------------------------------------------------------------------------
  const theme = useThemedStyles();
  const frameStyle = useFrameStyle(docType);
  const behaviorConfig = useBehaviorConfig();
  const { getDocumentLabel, getInstructionText, getUIText } = useLocalizedStrings();

  const styles = useMemo(() => createStyles(theme), [theme]);

  // -------------------------------------------------------------------------
  // Camera Setup
  // -------------------------------------------------------------------------
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });

  // -------------------------------------------------------------------------
  // Document Detection Hook
  // -------------------------------------------------------------------------
  const {
    isShapeDetected,
    isDocumentValid,
    shouldAutoCapture,
    shouldPerformOcrValidation,
    ocrValidationState,
    onCaptureTriggered,
    updateDetection,
    onOcrValidationComplete,
  } = useDocumentDetection(isCameraReady, captureInProgress, disableDetection);

  // The frame worklet calls a stable function, so it isn't re-created every time the detection state changes
  const updateDetectionRef = useRef(updateDetection);
  updateDetectionRef.current = updateDetection;
  const forwardDetection = useCallback((detection: Parameters<typeof updateDetection>[0]) => {
    updateDetectionRef.current(detection);
  }, []);

  // Liveness detection callback
  const updateLivenessScore = useCallback((score: number) => {
    setLivenessScore(score);
  }, []);

  // -------------------------------------------------------------------------
  // OCR Validation
  // -------------------------------------------------------------------------

  /**
   * Validates document text using ML Kit OCR
   */
  const validateDocumentText = useCallback(
    (ocrResult: any, documentType: VerifiedDocType): boolean => {
      try {
        const detectedText = ocrResult?.text ?? '';
        const minTextLength = behaviorConfig.detection?.ocr?.minTextLength ?? 15;

        const validationResult = DocumentValidation.validateDocumentText(
          detectedText,
          documentType,
          minTextLength
        );

        // Always log validation results for debugging
        console.log('[OCR] Validation result:', {
          isValid: validationResult.isValid,
          confidence: `${(validationResult.confidence * 100).toFixed(0)}%`,
          textLength: validationResult.textLength,
          detectedKeywords: validationResult.detectedKeywords,
        });

        return validationResult.isValid;
      } catch (error) {
        console.log('[OCR] Validation error:', error);
        return false;
      }
    },
    [behaviorConfig.detection?.ocr?.minTextLength]
  );

  /**
   * Performs OCR validation on captured image using Google Cloud Vision API
   */
  const performOCRValidation = useCallback(
    async (imagePath: string, documentType: VerifiedDocType): Promise<boolean> => {
      // Check if Cloud Vision is configured
      if (!getCloudVisionConfig()) {
        console.log('[OCR] Cloud Vision not configured, skipping validation');
        return true; // Allow capture if OCR not configured
      }

      try {
        // Use language hints based on document type (Arabic + English + French for most docs)
        const languageHints = ['ar', 'en', 'fr'];

        console.log(`[OCR] Starting Cloud Vision recognition...`);
        const ocrResult = await recognizeText(imagePath, languageHints);

        // Log what OCR detected
        const detectedText = ocrResult?.text ?? '';
        console.log(`[OCR] ========== TEXT DETECTED ==========`);
        console.log(`[OCR] Document type: ${documentType}`);
        console.log(`[OCR] Text length: ${detectedText.length} characters`);
        console.log(`[OCR] Detected languages: ${ocrResult.detectedLanguages.join(', ')}`);
        console.log(`[OCR] Raw text:\n${detectedText.substring(0, 500)}${detectedText.length > 500 ? '...' : ''}`);
        console.log(`[OCR] ====================================`);

        return validateDocumentText({ text: detectedText }, documentType);
      } catch (error: any) {
        const message = error?.message ?? 'Unknown';
        const code = error?.code ?? 'UNKNOWN';
        console.log(`[OCR] Validation failed: [${code}] ${message}`);

        // If API key is missing or network error, allow capture anyway
        if (code === 'API_KEY_MISSING' || code === 'NETWORK_ERROR') {
          console.log('[OCR] Allowing capture due to OCR service unavailability');
          return true;
        }

        return false;
      }
    },
    [validateDocumentText]
  );

  // -------------------------------------------------------------------------
  // Frame Processor
  // -------------------------------------------------------------------------

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';

      try {
        // Frame throttling for performance (the counter lives on the frame output's worklet runtime)
        const runtime = globalThis as unknown as { __identityCaptureFrameCount?: number };
        runtime.__identityCaptureFrameCount =
          ((runtime.__identityCaptureFrameCount ?? 0) + 1) % FRAME_PROCESSING.FRAME_SKIP;
        if (runtime.__identityCaptureFrameCount !== 0) {
          return;
        }

        const frameWidth = frame.width;
        const frameHeight = frame.height;
        const processed = frameToProcessingBuffer(frame, FRAME_PROCESSING.PROCESSING_LONG_SIDE);
        if (processed === null) {
          return;
        }

        const detection = detectDocumentWithOpenCV(
          processed.buffer,
          processed.width,
          processed.height,
          frameWidth,
          frameHeight,
          docType
        );

        scheduleOnRN(forwardDetection, {
          isDetected: detection.isDetected,
          corners: detection.corners,
          confidence: detection.confidence,
        });

        // Run liveness detection if enabled and document is detected
        if (enableLivenessDetection && detection.isDetected) {
          const livenessResult = scoreLiveness(processed.buffer, processed.width, processed.height);
          scheduleOnRN(updateLivenessScore, livenessResult.overallScore);
        }
      } catch (error) {
        scheduleOnRN(forwardDetection, {
          isDetected: false,
          corners: null,
          confidence: 0,
        });
      } finally {
        // Every frame must be disposed, or the camera pipeline stalls
        frame.dispose();
      }
    },
    [docType, enableLivenessDetection, forwardDetection, updateLivenessScore]
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: FRAME_PROCESSING.TARGET_RESOLUTION,
    onFrame,
    onFrameDropped: () => undefined,
  });

  const outputs = useMemo(
    () => (disableDetection ? [photoOutput] : [photoOutput, frameOutput]),
    [disableDetection, photoOutput, frameOutput]
  );

  // -------------------------------------------------------------------------
  // Capture Handler
  // -------------------------------------------------------------------------

  /**
   * Gets liveness result from the frame processor detection
   * Uses the liveness score calculated during frame processing
   */
  const getLivenessResult = useCallback(
    (): CapturedImageWithLiveness['liveness'] | undefined => {
      if (!enableLivenessDetection) {
        return undefined;
      }

      const isLive = livenessScore >= 0.50;
      let summary: string;

      if (livenessScore >= 0.7) {
        summary = 'High confidence: Image appears to be from a real physical source.';
      } else if (livenessScore >= 0.5) {
        summary = 'Moderate confidence: Image likely from a real source.';
      } else if (livenessScore >= 0.35) {
        summary = 'Low confidence: Image shows characteristics of a digital screen capture.';
      } else {
        summary = 'Very low confidence: Image strongly indicates a screen/digital copy.';
      }

      console.log('[Liveness] Result from frame processing:', {
        isLive,
        score: `${(livenessScore * 100).toFixed(0)}%`,
        summary,
      });

      return {
        isLive,
        score: livenessScore,
        confidence: 0.75,
        summary,
      };
    },
    [enableLivenessDetection, livenessScore]
  );

  const handleCapture = useCallback(async () => {
    if (captureInProgress || !isCameraReady) {
      return;
    }

    setCaptureInProgress(true);
    onCaptureTriggered();

    // Start progress animation
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: theme.animation.progress?.duration ?? 1500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    try {
      const photo = await photoOutput.capturePhotoToFile(
        { flashMode: isFlashEnabled ? 'on' : 'off' },
        {}
      );

      const imagePath = toFileUri(photo.filePath);

      // Get liveness detection result from frame processor
      let livenessResult: CapturedImageWithLiveness['liveness'] | undefined;
      if (enableLivenessDetection) {
        livenessResult = getLivenessResult();

        if (livenessResult && !livenessResult.isLive && blockOnLivenessFail) {
          Alert.alert(
            'Liveness Check Failed',
            `This appears to be a photo of a screen or digital copy.\n\nScore: ${(livenessResult.score * 100).toFixed(0)}%\n\n${livenessResult.summary}`,
            [
              { text: 'Try Again', style: 'default' },
              {
                text: 'Capture Anyway',
                style: 'destructive',
                onPress: () => onCapture(imagePath, livenessResult),
              },
            ],
            { cancelable: false }
          );
          setCaptureInProgress(false);
          progressAnimation.setValue(0);
          return;
        }
      }

      if (disableDetection || !enableOCRValidation) {
        onCapture(imagePath, livenessResult);
        return;
      }

      // Perform OCR validation
      const isValid = await performOCRValidation(imagePath, docType);

      if (isValid) {
        onCapture(imagePath, livenessResult);
      } else {
        const docLabel = getDocumentLabel(docType).toLowerCase();

        Alert.alert(
          'Document Validation Failed',
          `The captured image does not appear to be a valid ${docLabel}. Please ensure the document is clearly visible and try again.`,
          [
            { text: 'Try Again', style: 'default' },
            {
              text: 'Capture Anyway',
              style: 'destructive',
              onPress: () => onCapture(imagePath, livenessResult),
            },
          ],
          { cancelable: false }
        );
      }
    } catch (error) {
      if (DEBUG_LOGGING) {
        console.log('[Capture] Failed:', error);
      }
    } finally {
      setCaptureInProgress(false);
      progressAnimation.setValue(0);
    }
  }, [
    captureInProgress,
    isCameraReady,
    isFlashEnabled,
    photoOutput,
    disableDetection,
    enableOCRValidation,
    enableLivenessDetection,
    blockOnLivenessFail,
    docType,
    theme.animation.progress?.duration,
    progressAnimation,
    onCapture,
    onCaptureTriggered,
    performOCRValidation,
    getLivenessResult,
    getDocumentLabel,
  ]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Auto-capture effect
  useEffect(() => {
    if (shouldAutoCapture) {
      handleCapture();
    }
  }, [shouldAutoCapture, handleCapture]);

  // OCR validation effect - takes a snapshot and validates when requested
  useEffect(() => {
    if (!shouldPerformOcrValidation || captureInProgress) {
      return;
    }

    const performValidation = async () => {
      try {
        console.log('[OCR] Taking snapshot for validation...');
        const photo = await photoOutput.capturePhotoToFile(
          { flashMode: 'off' }, // Don't use flash for validation snapshots
          {}
        );

        const imagePath = toFileUri(photo.filePath);

        console.log('[OCR] Running OCR validation on snapshot...');
        const isValid = await performOCRValidation(imagePath, docType);
        onOcrValidationComplete(isValid);
      } catch (error) {
        console.log('[OCR] Validation snapshot failed:', error);
        onOcrValidationComplete(false);
      }
    };

    performValidation();
  }, [shouldPerformOcrValidation, captureInProgress, docType, photoOutput, performOCRValidation, onOcrValidationComplete]);

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  const toggleFlash = useCallback(() => {
    setIsFlashEnabled((prev) => !prev);
  }, []);

  const handleCameraStarted = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  const handleCameraError = useCallback((error: any) => {
    if (DEBUG_LOGGING) {
      console.log('[Camera] Error:', error);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived Values
  // -------------------------------------------------------------------------

  const documentLabel = useMemo(() => getDocumentLabel(docType), [getDocumentLabel, docType]);
  const baseInstructionText = useMemo(() => getInstructionText(docType), [getInstructionText, docType]);

  // Dynamic instruction based on detection state
  const currentInstruction = useMemo(() => {
    if (captureInProgress) {
      return getUIText('capturing');
    }
    if (isDocumentValid) {
      return getUIText('holdSteadyCapturing');
    }
    if (isShapeDetected) {
      return getUIText('documentDetected');
    }
    return baseInstructionText;
  }, [captureInProgress, isDocumentValid, isShapeDetected, baseInstructionText, getUIText]);

  // Animate instruction chip when text changes
  useEffect(() => {
    if (lastInstructionRef.current !== currentInstruction) {
      lastInstructionRef.current = currentInstruction;

      // Pulse animation: grow then shrink
      Animated.sequence([
        Animated.timing(instructionScaleAnim, {
          toValue: 1.1,
          duration: 150,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(instructionScaleAnim, {
          toValue: 1,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentInstruction, instructionScaleAnim]);

  // Determine frame border color based on state
  const frameBorderColor = useMemo(() => {
    if (isDocumentValid) {
      return '#4CAF50'; // Green when validated
    }
    if (isShapeDetected) {
      return '#4CAF50'; // Green when shape detected
    }
    return '#ffffff'; // White when scanning
  }, [isDocumentValid, isShapeDetected]);

  const overlayDimensions = useMemo(() => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

    const frameTop = (parseFloat(frameStyle.top.replace('%', '')) / 100) * screenHeight;
    const frameLeft = (parseFloat(frameStyle.left.replace('%', '')) / 100) * screenWidth;
    const frameRight = (parseFloat(frameStyle.right.replace('%', '')) / 100) * screenWidth;
    const frameHeight = (parseFloat(frameStyle.height.replace('%', '')) / 100) * screenHeight;
    const frameWidth = screenWidth - frameLeft - frameRight;

    return {
      screenWidth,
      screenHeight,
      frameTop,
      frameLeft,
      frameWidth,
      frameHeight,
      borderRadius: 16,
    };
  }, [frameStyle]);

  // -------------------------------------------------------------------------
  // Render: Permission States
  // -------------------------------------------------------------------------

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>{getUIText('cameraPermissionRequired')}</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>{getUIText('grantPermission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>{getUIText('noCamera')}</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={onCancel}>
          <Text style={styles.permissionButtonText}>{getUIText('cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Main View
  // -------------------------------------------------------------------------

  const {
    screenWidth,
    screenHeight,
    frameTop,
    frameLeft,
    frameWidth,
    frameHeight,
    borderRadius,
  } = overlayDimensions;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          outputs={outputs}
          torchMode={isFlashEnabled ? 'on' : 'off'}
          onStarted={handleCameraStarted}
          onError={handleCameraError}
        />

        {/* SVG Overlay */}
        <View style={styles.overlayContainer} pointerEvents="none">
          <Svg width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFill}>
            <Defs>
              <Mask id="frameMask">
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="white" />
                <Path
                  d={createRoundedRectPath(frameLeft, frameTop, frameWidth, frameHeight, borderRadius)}
                  fill="black"
                />
              </Mask>
            </Defs>

            {/* Semi-transparent overlay */}
            <Rect
              x="0"
              y="0"
              width={screenWidth}
              height={screenHeight}
              fill="rgba(0, 0, 0, 0.6)"
              mask="url(#frameMask)"
            />

            {/* Frame border - changes color based on detection state */}
            <Path
              d={createRoundedRectPath(frameLeft, frameTop, frameWidth, frameHeight, borderRadius)}
              stroke={frameBorderColor}
              strokeWidth={isShapeDetected ? 3 : 2}
              strokeDasharray={isShapeDetected ? undefined : "5,5"}
              fill="transparent"
            />
          </Svg>
        </View>
      </View>

      {/* UI Overlay */}
      <View style={styles.absoluteContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onCancel}>
            <ArrowLeftIcon size={28} color={theme.colors.text?.inverse ?? '#fff'} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{documentLabel}</Text>
          </View>

          <View style={styles.rightButtonContainer}>
            {enableFlash && (
              <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
                <Text style={styles.flashIcon}>{isFlashEnabled ? '🔦' : '💡'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Instructions - original position */}
        <View style={styles.instructionContainer}>
          <Text style={styles.simpleInstruction}>{baseInstructionText}</Text>
        </View>

        {/* Animated Status Chip and Capture Button */}
        <View style={styles.statusContainer}>
          {/* Animated status chip */}
          <Animated.View
            style={[
              styles.statusChip,
              isShapeDetected && styles.statusChipDetected,
              { transform: [{ scale: instructionScaleAnim }] },
            ]}
          >
            <Text style={styles.statusChipText}>
              {currentInstruction}
            </Text>
          </Animated.View>

          {/* Liveness indicator - shown when liveness detection is enabled */}
          {enableLivenessDetection && isShapeDetected && (
            <View style={[
              styles.livenessChip,
              livenessScore >= 0.5 ? styles.livenessChipPass : styles.livenessChipFail,
            ]}>
              <Text style={styles.livenessChipText}>
                {livenessScore >= 0.5
                  ? `✓ Live: ${(livenessScore * 100).toFixed(0)}%`
                  : `⚠ Screen detected: ${(livenessScore * 100).toFixed(0)}%`
                }
              </Text>
            </View>
          )}

          {/* Capture Button */}
          <TouchableOpacity
            style={[
              styles.captureButton,
              isDocumentValid && styles.captureButtonValid,
            ]}
            onPress={handleCapture}
            disabled={captureInProgress}
          >
            <View style={[
              styles.captureButtonInner,
              isDocumentValid && styles.captureButtonInnerValid,
            ]} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// Helper Components
// ============================================================================

// Note: Status indicators have been replaced with animated instruction chip

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates an SVG path for a rounded rectangle
 */
function createRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {
  return `
    M ${x + radius} ${y}
    L ${x + width - radius} ${y}
    Q ${x + width} ${y} ${x + width} ${y + radius}
    L ${x + width} ${y + height - radius}
    Q ${x + width} ${y + height} ${x + width - radius} ${y + height}
    L ${x + radius} ${y + height}
    Q ${x} ${y + height} ${x} ${y + height - radius}
    L ${x} ${y + radius}
    Q ${x} ${y} ${x + radius} ${y}
    Z
  `;
}

// ============================================================================
// Styles
// ============================================================================

// Note: Old indicator styles removed - using instruction chip instead

/** Creates dynamic styles based on theme */
const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    permissionText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.sizes.lg,
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
      fontFamily: theme.typography.fonts.regular,
    },
    permissionButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.layout.borderRadius,
    },
    permissionButtonText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.sizes.base,
      fontWeight: theme.typography.weights.semibold,
      fontFamily: theme.typography.fonts.semibold,
    },
    cameraContainer: {
      flex: 1,
      position: 'relative',
    },
    absoluteContent: {
      flex: 1,
      position: 'absolute',
      top: mvs(Platform.OS === 'android' ? 40 : 50),
      left: 0,
      right: 0,
      bottom: 0,
    },
    overlayContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    header: {
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'space-between',
    },
    backButton: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      zIndex: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 5,
    },
    headerTitle: {
      color: theme.colors.text?.inverse ?? '#fff',
      fontSize: theme.typography.sizes.lg,
      fontWeight: theme.typography.weights.semibold,
      fontFamily: theme.typography.fonts.semibold,
      textAlign: 'center',
    },
    rightButtonContainer: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      justifyContent: 'center',
      alignItems: 'center',
    },
    flashButton: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      justifyContent: 'center',
      alignItems: 'center',
    },
    flashIcon: {
      fontSize: 24,
    },
    instructionContainer: {
      flex: 1,
      alignItems: 'center',
      marginTop: theme.spacing.md,
      marginHorizontal: theme.spacing.lg,
    },
    simpleInstruction: {
      color: theme.colors.text?.inverse ?? '#fff',
      fontSize: theme.typography.sizes.base,
      textAlign: 'center',
      fontWeight: theme.typography.weights.normal,
      fontFamily: theme.typography.fonts.regular,
      lineHeight: theme.typography.sizes.base * (theme.typography.lineHeights?.normal ?? 1.4),
    },
    statusChip: {
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 25,
      marginBottom: 15,
    },
    statusChipDetected: {
      backgroundColor: 'rgba(76, 175, 80, 0.9)',
    },
    statusChipText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    livenessChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 10,
    },
    livenessChipPass: {
      backgroundColor: 'rgba(76, 175, 80, 0.85)',
    },
    livenessChipFail: {
      backgroundColor: 'rgba(255, 59, 48, 0.85)',
    },
    livenessChipText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    statusContainer: {
      marginBottom: theme.spacing.lg + 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureButton: {
      marginTop: 20,
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    captureButtonActive: {
      backgroundColor: 'rgba(255, 193, 7, 0.3)', // Yellow when shape detected
      borderColor: '#FFC107',
    },
    captureButtonValid: {
      backgroundColor: 'rgba(76, 175, 80, 0.3)', // Green when OCR validated
      borderColor: '#4CAF50',
    },
    captureButtonInner: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
    },
    captureButtonInnerActive: {
      backgroundColor: '#FFC107', // Yellow when shape detected
    },
    captureButtonInnerValid: {
      backgroundColor: '#4CAF50', // Green when OCR validated
    },
  });

export default CustomCameraView;
