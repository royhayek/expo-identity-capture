import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
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
import { useResizePlugin } from "vision-camera-resize-plugin";
import { useRunOnJS } from "react-native-worklets-core";
import { areCornersStable } from "../utils/DocumentDetectionProcessor";
import TextRecognition from "@react-native-ml-kit/text-recognition";

interface CustomCameraViewProps {
  docType: VerifiedDocType;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
  disableDetection?: boolean;
  enableFlash?: boolean;
}

export const CustomCameraView: React.FC<CustomCameraViewProps> = ({
  docType,
  onCapture,
  onCancel,
  disableDetection = false,
  enableFlash = true,
}) => {
  const [isFlashEnabled, setIsFlashEnabled] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

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
  const resizePlugin = useResizePlugin();

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

  // Document text validation function (declared first so it can be used by other functions)
  const validateDocumentText = useCallback(
    (ocrResult: any, documentType: VerifiedDocType): boolean => {
      try {
        const detectedText = ocrResult?.text?.toLowerCase() || "";

        if (!detectedText || detectedText.length < 10) {
          console.log("📝 Insufficient text for validation (need 10+ chars)");
          return false;
        }

        // Skip obvious debug/log text
        const debugPatterns = [
          /log\s+/i,
          /console/i,
          /debug/i,
          /error/i,
          /warning/i,
          /starting\s+/i,
          /validation/i,
          /detected\s+text/i,
          /analysis/i,
          /buffer/i,
          /dimensions/i,
          /confidence/i,
        ];

        let debugMatches = 0;
        debugPatterns.forEach((pattern) => {
          if (pattern.test(detectedText)) debugMatches++;
        });

        if (debugMatches >= 2) {
          console.log("❌ Text appears to be debug output, not document text");
          return false;
        }

        // Document type specific keywords (relaxed for better matching)
        const documentKeywords: Record<VerifiedDocType, string[]> = {
          passport: [
            "passport",
            "passeport",
            "جواز سفر",
            "republic",
            "state",
            "nationality",
            "birth",
            "sex",
            "country",
            "document",
            "given name",
            "surname",
            "دولة",
            "جمهورية",
          ],
          civil_id: [
            "civil",
            "identity",
            "card",
            "national",
            "citizen",
            "بطاقة مدنية",
            "هوية",
            "republic",
            "state",
            "الجمهورية",
            "الكويت",
            "kuwait",
            "مدني",
            "رقم مدني",
          ],
          army_card: [
            "military",
            "army",
            "armed forces",
            "service",
            "rank",
            "القوات المسلحة",
            "عسكرية",
            "الجيش",
            "رتبة",
            "عسكري",
          ],
          residence_permit: [
            "residence",
            "permit",
            "visa",
            "stay",
            "إقامة",
            "تصريح إقامة",
            "resident",
            "immigration",
            "work",
            "هجرة",
            "مقيم",
            "إذن",
          ],
          civil_register: [
            "register",
            "civil register",
            "سجل مدني",
            "قيد",
            "عائلي",
            "family",
            "أسرة",
            "registration",
            "قيود",
            "نفوس",
            "population",
            "records",
            "سجلات",
            "دائرة النفوس",
          ],
        };

        // General document indicators
        const generalIndicators = [
          "republic",
          "state",
          "government",
          "ministry",
          "authority",
          "number",
          "date",
          "name",
          "nationality",
          "issued",
          "valid",
          "الجمهورية",
          "دولة",
          "حكومة",
          "وزارة",
          "رسمي",
          "رقم",
          "تاريخ",
          "اسم",
          "جنسية",
          "صادر",
          "صالح",
        ];

        const specificKeywords = documentKeywords[documentType] || [];

        // Count matches
        let specificMatches = 0;
        specificKeywords.forEach((keyword) => {
          if (detectedText.includes(keyword.toLowerCase())) {
            specificMatches++;
            console.log(`✅ Found keyword: ${keyword}`);
          }
        });

        let generalMatches = 0;
        generalIndicators.forEach((indicator) => {
          if (detectedText.includes(indicator.toLowerCase())) {
            generalMatches++;
          }
        });

        // Relaxed validation criteria for OCR-based detection
        const hasGeneralIndicators = generalMatches >= 1; // At least 1 general indicator
        const hasSpecificKeywords = specificMatches >= 1; // At least 1 specific keyword
        const hasSubstantialText = detectedText.length >= 10; // Reduced to 10 characters minimum

        const isValid =
          hasGeneralIndicators && hasSpecificKeywords && hasSubstantialText;

        console.log(`📋 OCR Validation:`, {
          general: `${generalMatches}/1+`,
          specific: `${specificMatches}/1+`,
          textLength: `${detectedText.length}/10+`,
          result: isValid,
        });

        return isValid;
      } catch (error) {
        console.log("❌ Text validation error:", error);
        return false;
      }
    },
    []
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
          setTimeout(() => reject(new Error("OCR_TIMEOUT")), 5000)
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
        // Skip all detection if disabled
        if (disableDetection) {
          return;
        }

        // Frame throttling for performance - check every 5 frames (~0.17 seconds at 30fps)
        frameCountRef.current = frameCountRef.current + 1;
        if (frameCountRef.current % 5 !== 0) return;

        const frameWidth = frame.width;
        const frameHeight = frame.height;

        console.log("🔍 OCR-based detection check (every 5 frames)");

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
    [docType, disableDetection]
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

  const handleCapture = useCallback(async () => {
    if (captureInProgress || !cameraRef.current || !isCameraReady) return;

    setCaptureInProgress(true);

    // Start progress animation
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: 1500, // 1.5 seconds
      easing: Easing.linear,
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

      if (disableDetection) {
        // Skip OCR validation when detection is disabled
        console.log("📸 Detection disabled - directly capturing image");
        onCapture(imagePath);
      } else {
        // Perform OCR validation on the captured image (not on frame processing)
        console.log("🔍 Starting post-capture OCR validation...");
        const ocrValid = await runOCRValidation(imagePath, docType);

        if (ocrValid) {
          console.log("✅ OCR validation passed - document confirmed");
          onCapture(imagePath);
        } else {
          console.log("⚠️ OCR validation failed - still allowing capture");
          // Still allow capture even if OCR fails (fallback to visual detection)
          Alert.alert(
            "Document Captured",
            "Photo taken successfully. OCR text validation could not confirm document type, but visual detection was successful.",
            [
              {
                text: "Retake",
                style: "cancel",
              },
              {
                text: "Use This Photo",
                onPress: () => onCapture(imagePath),
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error("❌ Capture failed:", error);
      Alert.alert("Capture Failed", "Could not take photo. Please try again.");
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
  ]);

  const getDocumentTypeLabel = () => {
    switch (docType) {
      case "passport":
        return "Passport";
      case "civil_id":
        return "Civil ID";
      case "army_card":
        return "Army Card";
      case "residence_permit":
        return "Residence Permit";
      case "civil_register":
        return "Civil Register";
      default:
        return "Document";
    }
  };

  const getInstructionText = () => {
    if (docType === "passport") {
      return "Hold your passport in your hand and make sure it fully fits in the frame.";
    }
    if (docType === "civil_id") {
      return "Hold your civil ID in your hand and make sure it fully fits in the frame.";
    }
    if (docType === "army_card") {
      return "Hold your army card in your hand and make sure it fully fits in the frame.";
    }
    if (docType === "civil_register") {
      return "Hold your civil register in your hand and make sure it fully fits in the frame.";
    }
    if (docType === "residence_permit") {
      return "Hold your residence permit in your hand and make sure it fully fits in the frame.";
    }
    return "Hold your document in your hand and make sure it fully fits in the frame.";
  };

  const getOverlayStyle = () => {
    if (docType === "passport") {
      // Passport: Vertical rectangle (taller than wide) - scaled down to be smaller
      return {
        top: "28%" as const,
        left: "10%" as const,
        right: "10%" as const,
        height: "50%" as const,
      };
    } else if (docType === "civil_register") {
      // Civil Register: Square shape
      return {
        top: "35%" as const,
        left: "10%" as const,
        right: "10%" as const,
        height: "30%" as const,
      };
    } else {
      // ID Cards: Proper credit card aspect ratio (1.586:1 based on Lebanese civil ID reference)
      return {
        top: "35%" as const,
        left: "8%" as const,
        right: "8%" as const,
        height: "25%" as const, // Calculated to maintain proper ID card aspect ratio
      };
    }
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
            Alert.alert(
              "Camera Error",
              `Failed to initialize camera: ${error.message}`
            );
          }}
        />

        {/* SVG overlay with cutout */}
        {(() => {
          const { width: screenWidth, height: screenHeight } =
            Dimensions.get("window");
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
      <View style={styles.cleanHeader}>
        <TouchableOpacity style={styles.cleanBackButton} onPress={onCancel}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {getDocumentTypeLabel()}
          </Text>
        </View>
        {enableFlash && (
          <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
            <Text style={styles.flashIcon}>{isFlashEnabled ? "🔦" : "💡"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Instruction Text */}
      <View style={styles.instructionContainer}>
        <Text style={styles.simpleInstruction}>{getInstructionText()}</Text>
        <Text style={styles.simpleInstruction}>
          يرجى إمساك جواز سفرك بيدك والتأكد من ظهوره بالكامل داخل الكاميرا.
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
                <Svg width={70} height={70} viewBox="0 0 70 70">
                  <Defs>
                    <LinearGradient
                      id="progressGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop offset="0%" stopColor="#9b27b0" stopOpacity="0" />
                      <Stop offset="30%" stopColor="#9b27b0" stopOpacity="0.5" />
                      <Stop offset="70%" stopColor="#9b27b0" stopOpacity="0.8" />
                      <Stop offset="100%" stopColor="#9b27b0" stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Circle
                    cx="35"
                    cy="35"
                    r="32"
                    stroke="url(#progressGradient)"
                    strokeWidth="8"
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  permissionText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlaySection: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  documentGuide: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#ffffff",
    borderStyle: "dashed",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  detectionOverlay: {
    position: "absolute",
    borderWidth: 3,
    borderRadius: 16,
  },
  // Modern UI Styles
  modernHeader: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  modernBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonIcon: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
  },
  modernFlashButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  flashButtonText: {
    fontSize: 18,
  },
  modernTitleContainer: {
    position: "absolute",
    top: 120,
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 10,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  modernTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  modernDescription: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.9,
    marginBottom: 16,
  },
  modernStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modernStatusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  modernStatusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.9,
  },
  modernCaptureContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  modernCaptureButton: {
    width: 70,
    height: 70,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modernCaptureInner: {
    justifyContent: "center",
    alignItems: "center",
  },
  modernCaptureText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  modernProcessingText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
    opacity: 0.9,
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
  cleanHeader: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  cleanBackButton: {
    width: 60,
    height: 60,
    zIndex: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "500",
  },
  headerTitleContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  flashButton: {
    width: 60,
    height: 60,
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
    position: "absolute",
    top: 130,
    left: 36,
    right: 36,
    gap: 6,
    alignItems: "center",
    zIndex: 10,
  },
  simpleInstruction: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "400",
  },
  captureButtonContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#fff",
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
