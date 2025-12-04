import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Alert } from "react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
} from "react-native";
import Svg, {
  Defs,
  Rect,
  Mask,
  Path,
  Circle,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { VerifiedDocType } from "../types/extraction";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";
import { areCornersStable } from "../utils/DocumentDetectionProcessor";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { DocumentValidation } from "../utils/documentValidation";
import {
  useThemeConfig,
  useLocalizedStrings,
  useBehaviorConfig,
} from "../context/ConfigContext";
import {
  useThemedStyles,
  useFrameStyle,
  useProgressColors,
  useButtonDimensions,
} from "../utils/theme";
import { RESPONSIVE_VALUES } from "../utils/responsiveTheme";
import { mvs } from "react-native-size-matters";

// Arrow Left SVG Component
const ArrowLeftIcon: React.FC<{ size?: number; color?: string }> = ({ 
  size = 24, 
  color = "#fff" 
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

interface CustomCameraViewProps {
  docType: VerifiedDocType;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
  disableDetection?: boolean;
  enableFlash?: boolean;
  enableOCRValidation?: boolean;
}

export const CustomCameraView: React.FC<CustomCameraViewProps> = ({
  docType,
  onCapture,
  onCancel,
  disableDetection = false,
  enableFlash = true,
  enableOCRValidation = false,
}) => {
  const [isFlashEnabled, setIsFlashEnabled] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Configuration hooks
  const theme = useThemedStyles();
  const frameStyle = useFrameStyle(docType);
  const progressColors = useProgressColors();
  const captureButtonSize = useButtonDimensions("capture");
  const { getDocumentLabel, getInstructionText, currentLanguage } =
    useLocalizedStrings();
  const behaviorConfig = useBehaviorConfig();

  // Create dynamic styles based on theme
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  // Animated value for circular progress
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const [isDocumentDetected, setIsDocumentDetected] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<any>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  // Removed stableFrameCount state - now using confidence-based detection

  // Camera setup
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);

  // Previous detection state for stability checking
  const previousCornersRef = useRef<any>(null);
  const stableDetectionCountRef = useRef(0);
  const frameCountRef = useRef(0);
  // Smart OCR management - trigger during stable detection for real-time validation
  const ocrValidationRef = useRef<{
    inProgress: boolean;
    lastValidationTime: number;
    lastValidationResult: boolean | null;
    stableDetectionCount: number;
    needsValidation: boolean;
    hasConfirmedDetection: boolean;
    consecutiveFailures: number; // Track consecutive OCR failures
  }>({
    inProgress: false,
    lastValidationTime: 0,
    lastValidationResult: null,
    stableDetectionCount: 0,
    needsValidation: false,
    hasConfirmedDetection: false,
    consecutiveFailures: 0,
  });

  // Update detection state function
  const updateDetection = useCallback((detection: any) => {
    setIsDocumentDetected(detection.isDetected);
    setDetectedCorners(detection.corners);
    setDetectionConfidence(detection.confidence);
  }, []);

  const runUpdateDetection = useRunOnJS(updateDetection, [updateDetection]);

  // Document text validation function using improved validation utility
  const validateDocumentText = useCallback(
    (ocrResult: any, documentType: VerifiedDocType): boolean => {
      try {
        const detectedText = ocrResult?.text || "";
        const minTextLength = behaviorConfig.detection?.ocr?.minTextLength || 15;
        
        const validationResult = DocumentValidation.validateDocumentText(
          detectedText, 
          documentType, 
          minTextLength
        );

        console.log(`📋 OCR Validation Result:`, {
          isValid: validationResult.isValid,
          confidence: `${(validationResult.confidence * 100).toFixed(0)}%`,
          textLength: validationResult.textLength,
          detectedKeywords: validationResult.detectedKeywords.length,
          message: DocumentValidation.getValidationMessage(validationResult)
        });

        return validationResult.isValid;
      } catch (error) {
        console.log("❌ Text validation error:", error);
        return false;
      }
    },
    [behaviorConfig.detection?.ocr?.minTextLength]
  );

  // OCR-based document detection
  const performRealtimeOCRValidation = useCallback(
    async (
      documentType: VerifiedDocType,
      currentStableFrames: number
    ): Promise<void> => {
      if (ocrValidationRef.current.inProgress) {
        console.log("🔄 OCR validation already in progress - skipping");
        return;
      }

      const now = Date.now();
      // Throttle OCR checks - minimum 1.5 seconds between validations for faster response
      if (now - ocrValidationRef.current.lastValidationTime < 1500) {
        console.log("⏱️ OCR validation throttled - using cached result");
        const cachedResult = ocrValidationRef.current.lastValidationResult;
        if (cachedResult !== null) {
          console.log(`📋 Using cached OCR result: ${cachedResult}`);
          setIsDocumentDetected(cachedResult);
          setDetectionConfidence(cachedResult ? 0.9 : 0.3);
        }
        return;
      }

      // Set inProgress and time if not already set by frame processor
      if (!ocrValidationRef.current.inProgress) {
        ocrValidationRef.current.inProgress = true;
        console.log("🔒 OCR: Setting inProgress flag");
      }
      ocrValidationRef.current.lastValidationTime = now;

      console.log("🔍 Starting OCR-based document detection...");

      try {
        // Take a photo for OCR analysis
        if (!cameraRef.current) {
          console.log("❌ Camera not available for OCR");
          setIsDocumentDetected(false);
          setDetectionConfidence(0);
          ocrValidationRef.current.lastValidationResult = false;
          return;
        }

        const photo = await cameraRef.current.takePhoto({
          flash: "off",
          enableShutterSound: false,
        });

        const imagePath = photo.path.startsWith("file://")
          ? photo.path
          : `file://${photo.path}`;

        // OCR with timeout
        const ocrPromise = TextRecognition.recognize(imagePath);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("OCR_TIMEOUT")),
            behaviorConfig.detection?.ocr?.timeout || 5000
          )
        );

        const ocrResult = await Promise.race([ocrPromise, timeoutPromise]);

        const isValidDocument = validateDocumentText(ocrResult, documentType);

        console.log("📖 OCR Detection Result:", {
          isValid: isValidDocument,
          textLength: ocrResult?.text?.length || 0,
          blocks: ocrResult?.blocks?.length || 0,
          sampleText: ocrResult?.text?.substring(0, 50) || "No text",
        });

        // Stable detection: Only change state if we have a clear result
        ocrValidationRef.current.lastValidationResult = isValidDocument;

        if (isValidDocument) {
          // Document clearly detected - immediately show detection
          console.log("✅ DOCUMENT DETECTED via OCR - showing green frame");
          setIsDocumentDetected(true);
          setDetectionConfidence(0.9);
          ocrValidationRef.current.consecutiveFailures = 0; // Reset failure counter
        } else {
          // Document not detected - use failure counter for stability
          ocrValidationRef.current.consecutiveFailures++;

          if (!isDocumentDetected) {
            // We weren't detecting before, stay not detecting
            console.log(
              "❌ No document detected (maintaining not detected state)"
            );
            setIsDocumentDetected(false);
            setDetectionConfidence(0.3);
          } else {
            // We were detecting before - only switch off after multiple failures
            if (ocrValidationRef.current.consecutiveFailures >= 3) {
              console.log("❌ Document lost after 3 consecutive OCR failures");
              setIsDocumentDetected(false);
              setDetectionConfidence(0.3);
              ocrValidationRef.current.consecutiveFailures = 0;
            } else {
              console.log(
                `⚠️ OCR failed (${ocrValidationRef.current.consecutiveFailures}/3) - keeping detection active`
              );
              setDetectionConfidence(
                0.7 - ocrValidationRef.current.consecutiveFailures * 0.1
              );
            }
          }
        }
      } catch (error) {
        console.log(
          "⚠️ OCR detection failed:",
          error instanceof Error ? error.message : "Unknown"
        );
        ocrValidationRef.current.lastValidationResult = false;

        // On OCR error, only change state if we weren't detecting before
        if (!isDocumentDetected) {
          setIsDocumentDetected(false);
          setDetectionConfidence(0.1);
        } else {
          console.log(
            "⚠️ OCR error but document was detected before - keeping detection active"
          );
          setDetectionConfidence(0.6); // Lower confidence but keep detection
        }
      } finally {
        ocrValidationRef.current.inProgress = false;
      }
    },
    [validateDocumentText]
  );

  // This function is no longer needed - detection is handled directly by OCR

  // Post-capture OCR validation (more thorough)
  const performOCRValidation = useCallback(
    async (capturedImagePath: string, documentType: VerifiedDocType) => {
      if (ocrValidationRef.current.inProgress) {
        console.log("⏳ OCR validation already in progress");
        return false;
      }

      const now = Date.now();
      // Throttle OCR - minimum 3 seconds between validations
      if (now - ocrValidationRef.current.lastValidationTime < 3000) {
        console.log("⏱️ OCR validation throttled");
        return false;
      }

      ocrValidationRef.current.inProgress = true;
      ocrValidationRef.current.lastValidationTime = now;

      try {
        console.log("📝 Starting OCR validation for captured image...");

        // Use ML Kit OCR with timeout protection
        const ocrPromise = TextRecognition.recognize(capturedImagePath);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OCR_TIMEOUT")), 8000)
        );

        const ocrResult = await Promise.race([ocrPromise, timeoutPromise]);

        console.log(
          "📖 OCR completed - Text length:",
          ocrResult?.text?.length || 0
        );
        console.log("📚 OCR blocks found:", ocrResult?.blocks?.length || 0);

        // Validate document text
        const isValidDocument = validateDocumentText(ocrResult, documentType);

        console.log("🎯 OCR validation result:", {
          isValidDocument,
          textLength: ocrResult?.text?.length || 0,
          blocksCount: ocrResult?.blocks?.length || 0,
        });

        return isValidDocument;
      } catch (error) {
        console.log(
          "❌ OCR validation failed:",
          error instanceof Error ? error.message : "Unknown error"
        );

        // Don't crash on OCR failure - just return false
        if (error instanceof Error && error.message === "OCR_TIMEOUT") {
          console.log("⏰ OCR timed out - continuing without text validation");
        }

        return false; // Allow capture even if OCR fails
      } finally {
        ocrValidationRef.current.inProgress = false;
      }
    },
    [validateDocumentText]
  );

  const runOCRValidation = useRunOnJS(performOCRValidation, [
    performOCRValidation,
  ]);
  const runRealtimeOCRValidation = useRunOnJS(performRealtimeOCRValidation, [
    performRealtimeOCRValidation,
  ]);

  // Enhanced capture function with OCR validation after stable detection

  // Simplified OCR-based document detection frame processor
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      try {
        // Skip all detection if disabled or OCR validation is disabled
        if (disableDetection || !enableOCRValidation) {
          return;
        }

        // Frame throttling for performance - check every 10 frames (~0.33 seconds at 30fps)
        frameCountRef.current = frameCountRef.current + 1;
        if (frameCountRef.current % 10 !== 0) return;

        const frameWidth = frame.width;
        const frameHeight = frame.height;

        console.log("🔍 OCR-based detection check (every 10 frames)");

        // Create default corners for frame overlay based on document type
        let boxTop: number,
          boxLeft: number,
          boxWidth: number,
          boxHeight: number;

        if (docType === "passport") {
          // Passport: Vertical rectangle (taller than wide) - restored to better proportions
          boxTop = frameHeight * 0.2;
          boxLeft = frameWidth * 0.1;
          boxWidth = frameWidth * 0.8;
          boxHeight = frameHeight * 0.5;
        } else if (docType === "civil_register") {
          // Civil Register: Square shape
          boxTop = frameHeight * 0.25;
          boxLeft = frameWidth * 0.15;
          boxWidth = frameWidth * 0.7;
          boxHeight = boxWidth; // Square: height equals width
        } else {
          // ID Cards: Proper credit card aspect ratio (1.586:1 based on Lebanese civil ID reference)
          // Make it a proper rectangle, not square-like
          const cardAspectRatio = 1.586; // Width to height ratio of a standard ID card
          boxTop = frameHeight * 0.35;
          boxLeft = frameWidth * 0.08;
          boxWidth = frameWidth * 0.84;
          boxHeight = boxWidth / cardAspectRatio; // Calculate height to maintain proper aspect ratio
        }

        const defaultCorners = {
          topLeft: { x: boxLeft, y: boxTop },
          topRight: { x: boxLeft + boxWidth, y: boxTop },
          bottomLeft: { x: boxLeft, y: boxTop + boxHeight },
          bottomRight: { x: boxLeft + boxWidth, y: boxTop + boxHeight },
        };

        // Only reset detection state if OCR is not running and we don't currently detect a document
        // This prevents flickering while allowing proper state updates
        if (!ocrValidationRef.current.inProgress && !isDocumentDetected) {
          console.log(
            "🔷 Frame processor: Setting detection to FALSE (no OCR, no current detection)"
          );
          runUpdateDetection({
            isDetected: false,
            corners: defaultCorners,
            confidence: 0.5,
            aspectRatio: 1.0,
            isValidShape: true,
          });
        } else if (!ocrValidationRef.current.inProgress) {
          console.log(
            "🔶 Frame processor: Keeping current detection state (no OCR running)"
          );
          runUpdateDetection({
            isDetected: isDocumentDetected,
            corners: defaultCorners,
            confidence: detectionConfidence,
            aspectRatio: 1.0,
            isValidShape: true,
          });
        } else {
          console.log(
            "🔸 Frame processor: OCR in progress - not updating detection state"
          );
        }

        // Trigger OCR validation to check for document content
        console.log("🔍 Triggering OCR-based document detection...");

        // Set inProgress flag BEFORE calling OCR to prevent race condition
        if (!ocrValidationRef.current.inProgress) {
          const now = Date.now();
          if (now - ocrValidationRef.current.lastValidationTime >= 1500) {
            ocrValidationRef.current.inProgress = true;
            console.log("🔒 Frame processor: Setting OCR inProgress flag");
          }
        }

        runRealtimeOCRValidation(docType, 1); // Always pass stable frame count as 1
      } catch (error) {
        console.log("❌ Frame processor error:", error);
        runUpdateDetection({
          isDetected: false,
          corners: null,
          confidence: 0,
          aspectRatio: 0,
          isValidShape: false,
        });
      }
    },
    [docType, disableDetection, enableOCRValidation]
  );

  // Helper functions removed - using simplified edge detection inline

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const toggleFlash = useCallback(() => {
    setIsFlashEnabled(!isFlashEnabled);
  }, [isFlashEnabled]);

  const getDocumentTypeLabel = React.useCallback(() => {
    return getDocumentLabel(docType);
  }, [getDocumentLabel, docType]);

  const handleCapture = useCallback(async () => {
    if (captureInProgress || !cameraRef.current || !isCameraReady) return;

    setCaptureInProgress(true);

    // Start progress animation with configured duration
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: theme.animation.progress?.duration || 1500,
      easing: Easing.linear, // TODO: Map animation.easing to Easing functions
      useNativeDriver: true,
    }).start();

    try {
      console.log("📷 Taking photo for document capture...");

      const photo = await cameraRef.current.takePhoto({
        flash: isFlashEnabled ? "on" : "off",
      });

      const imagePath = photo.path.startsWith("file://")
        ? photo.path
        : `file://${photo.path}`;
      console.log("📸 Photo captured successfully:", imagePath);

      if (disableDetection || !enableOCRValidation) {
        // Skip OCR validation when detection is disabled or OCR validation is disabled
        console.log("📸 OCR validation disabled - directly capturing image");
        onCapture(imagePath);
      } else {
        // Perform OCR validation on the captured image
        console.log("🔍 Starting post-capture OCR validation...");
        const ocrValid = await runOCRValidation(imagePath, docType);

        if (ocrValid) {
          console.log("✅ OCR validation passed - document confirmed");
          onCapture(imagePath);
        } else {
          console.log("❌ OCR validation failed - showing validation alert");
          
          // Show alert for validation failure
          Alert.alert(
            "Document Validation Failed",
            `The captured image does not appear to be a valid ${getDocumentTypeLabel().toLowerCase()}. Please ensure the document is clearly visible and try again.`,
            [
              {
                text: "Try Again",
                style: "default",
                onPress: () => {
                  console.log("🔄 User chose to try again");
                  // Just return to camera view, don't call onCapture
                }
              },
              {
                text: "Capture Anyway",
                style: "destructive", 
                onPress: () => {
                  console.log("⚠️ User chose to capture despite validation failure");
                  onCapture(imagePath);
                }
              }
            ],
            { cancelable: false }
          );
        }
      }
    } catch (error) {
      console.error("❌ Capture failed:", error);
      throw error;
    } finally {
      setCaptureInProgress(false);
      // Reset progress animation
      progressAnimation.setValue(0);
    }
  }, [
    captureInProgress,
    onCapture,
    isCameraReady,
    isFlashEnabled,
    docType,
    runOCRValidation,
    enableOCRValidation,
    getDocumentTypeLabel,
    disableDetection,
  ]);

  const getDocumentInstructionText = React.useCallback(() => {
    return getInstructionText(docType);
  }, [getInstructionText, docType]);

  const getOverlayStyle = () => {
    // Use configured frame style, with fallbacks to current defaults
    return {
      top: frameStyle.top,
      left: frameStyle.left,
      right: frameStyle.right,
      height: frameStyle.height,
    };
  };

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>No camera device available</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={onCancel}>
          <Text style={styles.permissionButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
          torch={isFlashEnabled ? "on" : "off"}
          frameProcessor={frameProcessor}
          onInitialized={() => {
            console.log("✅ Camera initialized");
            setIsCameraReady(true);
          }}
          onError={(error) => {
            console.error("❌ Camera error:", error);
          }}
        />

        {/* SVG overlay with cutout */}
        {(() => {
          const { width: screenWidth, height: screenHeight } =
            Dimensions.get("screen");
          const overlayStyle = getOverlayStyle();

          // Convert percentage to pixels
          const frameTop =
            (parseFloat(overlayStyle.top.replace("%", "")) / 100) *
            screenHeight;
          const frameLeft =
            (parseFloat(overlayStyle.left.replace("%", "")) / 100) *
            screenWidth;
          const frameRight =
            (parseFloat(overlayStyle.right.replace("%", "")) / 100) *
            screenWidth;
          const frameHeight =
            (parseFloat(overlayStyle.height.replace("%", "")) / 100) *
            screenHeight;
          const frameWidth = screenWidth - frameLeft - frameRight;

          const borderRadius = 16;
          const isDetected =
            !disableDetection && detectedCorners && isDocumentDetected;

          return (
            <>
              {/* SVG Mask for overlay with rounded cutout */}
              <View style={styles.overlayContainer} pointerEvents="none">
                <Svg
                  width={screenWidth}
                  height={screenHeight}
                  style={StyleSheet.absoluteFill}
                >
                  <Defs>
                    <Mask id="mask">
                      <Rect
                        x="0"
                        y="0"
                        width={screenWidth}
                        height={screenHeight}
                        fill="white"
                      />
                      <Path
                        d={`
                          M ${frameLeft + borderRadius} ${frameTop}
                          L ${frameLeft + frameWidth - borderRadius} ${frameTop}
                          Q ${frameLeft + frameWidth} ${frameTop} ${
                          frameLeft + frameWidth
                        } ${frameTop + borderRadius}
                          L ${frameLeft + frameWidth} ${
                          frameTop + frameHeight - borderRadius
                        }
                          Q ${frameLeft + frameWidth} ${
                          frameTop + frameHeight
                        } ${frameLeft + frameWidth - borderRadius} ${
                          frameTop + frameHeight
                        }
                          L ${frameLeft + borderRadius} ${
                          frameTop + frameHeight
                        }
                          Q ${frameLeft} ${
                          frameTop + frameHeight
                        } ${frameLeft} ${frameTop + frameHeight - borderRadius}
                          L ${frameLeft} ${frameTop + borderRadius}
                          Q ${frameLeft} ${frameTop} ${
                          frameLeft + borderRadius
                        } ${frameTop}
                          Z
                        `}
                        fill="black"
                      />
                    </Mask>
                  </Defs>
                  <Rect
                    x="0"
                    y="0"
                    width={screenWidth}
                    height={screenHeight}
                    fill="rgba(0, 0, 0, 0.6)"
                    mask="url(#mask)"
                  />
                  {/* Frame border */}
                  <Path
                    d={`
                      M ${frameLeft + borderRadius} ${frameTop}
                      L ${frameLeft + frameWidth - borderRadius} ${frameTop}
                      Q ${frameLeft + frameWidth} ${frameTop} ${
                      frameLeft + frameWidth
                    } ${frameTop + borderRadius}
                      L ${frameLeft + frameWidth} ${
                      frameTop + frameHeight - borderRadius
                    }
                      Q ${frameLeft + frameWidth} ${frameTop + frameHeight} ${
                      frameLeft + frameWidth - borderRadius
                    } ${frameTop + frameHeight}
                      L ${frameLeft + borderRadius} ${frameTop + frameHeight}
                      Q ${frameLeft} ${frameTop + frameHeight} ${frameLeft} ${
                      frameTop + frameHeight - borderRadius
                    }
                      L ${frameLeft} ${frameTop + borderRadius}
                      Q ${frameLeft} ${frameTop} ${
                      frameLeft + borderRadius
                    } ${frameTop}
                      Z
                    `}
                    stroke={isDetected ? "#4CAF50" : "#ffffff"}
                    strokeWidth={isDetected ? 4 : 2}
                    strokeDasharray={isDetected ? undefined : "5,5"}
                    fill="transparent"
                  />
                </Svg>
              </View>
            </>
          );
        })()}
      </View>

      {/* Clean Header */}
      <View style={styles.absoluteContent}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onCancel}>
            <ArrowLeftIcon 
              size={28} 
              color={theme.colors.text?.inverse || "#fff"} 
            />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{getDocumentTypeLabel()}</Text>
          </View>
          <View style={styles.rightButtonContainer}>
            {enableFlash && (
              <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
                <Text style={styles.flashIcon}>
                  {isFlashEnabled ? "🔦" : "💡"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Instruction Text */}
        <View style={styles.instructionContainer}>
          <Text style={styles.simpleInstruction}>
            {getDocumentInstructionText()}
          </Text>
        </View>

        {/* Modern Capture Button with Circular Progress */}
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
            disabled={captureInProgress}
          >
            <View style={styles.captureButtonInner}>
              {captureInProgress && (
                <Animated.View
                  style={[
                    styles.progressRing,
                    {
                      transform: [
                        {
                          rotate: progressAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Svg
                    width={theme.layout.buttons.capture.width}
                    height={theme.layout.buttons.capture.height}
                    viewBox={`0 0 ${theme.layout.buttons.capture.width} ${theme.layout.buttons.capture.height}`}
                  >
                    <Defs>
                      <LinearGradient
                        id="progressGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <Stop
                          offset="0%"
                          stopColor={progressColors.gradient[0]}
                          stopOpacity="0"
                        />
                        <Stop
                          offset="30%"
                          stopColor={
                            progressColors.gradient[1] ||
                            progressColors.gradient[0]
                          }
                          stopOpacity="0.5"
                        />
                        <Stop
                          offset="70%"
                          stopColor={
                            progressColors.gradient[2] ||
                            progressColors.gradient[1] ||
                            progressColors.gradient[0]
                          }
                          stopOpacity="0.8"
                        />
                        <Stop
                          offset="100%"
                          stopColor={
                            progressColors.gradient[2] ||
                            progressColors.gradient[1] ||
                            progressColors.gradient[0]
                          }
                          stopOpacity="1"
                        />
                      </LinearGradient>
                    </Defs>
                    <Circle
                      cx={theme.layout.buttons.capture.width / 2}
                      cy={theme.layout.buttons.capture.height / 2}
                      r={theme.layout.buttons.capture.width / 2 - 6}
                      stroke="url(#progressGradient)"
                      strokeWidth={Math.max(
                        6,
                        theme.layout.buttons.capture.width * 0.08
                      )}
                      fill="none"
                      strokeDasharray="80 200"
                      strokeLinecap="round"
                    />
                  </Svg>
                </Animated.View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Create dynamic styles based on theme
const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    permissionContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    permissionText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.sizes.lg,
      textAlign: "center",
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
      position: "relative",
    },
    absoluteContent: {
      flex: 1,
      position: "absolute",
      top: mvs(Platform.OS === "android" ? 40 : 50),
      left: 0,
      right: 0,
      bottom: 0,
    },
    overlayContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modernTitle: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 8,
    },
    // Legacy styles for backward compatibility
    topToolbar: {
      display: "none",
    },
    toolbarButton: {
      display: "none",
    },
    toolbarButtonText: {
      display: "none",
    },
    docTypeLabel: {
      display: "none",
    },
    bottomContainer: {
      display: "none",
    },
    instructionText: {
      display: "none",
    },
    statusContainer: {
      display: "none",
    },
    statusIndicator: {
      display: "none",
    },
    statusText: {
      display: "none",
    },
    captureButtonText: {
      display: "none",
    },
    processingText: {
      display: "none",
    },
    // New Clean UI Styles
    header: {
      zIndex: 10,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      justifyContent: "space-between",
    },
    backButton: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      zIndex: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitleContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 5,
    },
    headerTitle: {
      color: theme.colors.text?.inverse || "#fff",
      fontSize: theme.typography.sizes.lg,
      fontWeight: theme.typography.weights.semibold,
      fontFamily: theme.typography.fonts.semibold,
      textAlign: "center",
    },
    rightButtonContainer: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      justifyContent: "center",
      alignItems: "center",
    },
    flashButton: {
      width: theme.layout.buttons.header.width,
      height: theme.layout.buttons.header.height,
      justifyContent: "center",
      alignItems: "center",
    },
    flashIcon: {
      fontSize: 24,
    },
    headerSpacer: {
      width: 60,
    },
    instructionContainer: {
      flex: 1,
      alignItems: "center",
      marginTop: theme.spacing.md,
      marginHorizontal: theme.spacing.lg,
    },
    simpleInstruction: {
      color: theme.colors.text?.inverse || "#fff",
      fontSize: theme.typography.sizes.base,
      textAlign: "center",
      fontWeight: theme.typography.weights.normal,
      fontFamily: theme.typography.fonts.regular,
      lineHeight:
        theme.typography.sizes.base *
        (theme.typography.lineHeights?.normal || 1.4),
    },
    captureButtonContainer: {
      marginBottom: theme.spacing.lg + 20,
      alignItems: "center",
    },
    captureButton: {
      width: theme.layout.buttons?.capture?.width || 60,
      height: theme.layout.buttons?.capture?.height || 60,
      borderRadius: (theme.layout.buttons?.capture?.width || 60) / 2,
      backgroundColor: theme.colors.surface,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: theme.colors.background,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
    },
    captureButtonInner: {
      width: (theme.layout.buttons?.capture?.width || 70) - 16,
      height: (theme.layout.buttons?.capture?.height || 70) - 16,
      borderRadius: ((theme.layout.buttons?.capture?.width || 70) - 16) / 2,
      backgroundColor: theme.colors.surface,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    },
    progressRing: {
      position: "absolute",
      top: -8,
      left: -8,
    },
    progressIndicator: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: "#4CAF50",
    },
    documentFrameBorder: {
      position: "absolute",
      borderWidth: 2,
      borderColor: "#ffffff",
      borderRadius: 16,
      backgroundColor: "transparent",
    },
    detectedFrameBorder: {
      position: "absolute",
      borderWidth: 4,
      borderColor: "#4CAF50",
      borderRadius: 16,
      backgroundColor: "transparent",
    },
  });

export default CustomCameraView;
