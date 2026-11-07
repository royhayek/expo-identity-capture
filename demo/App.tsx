import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  Switch,
  Image,
  Modal,
  Dimensions,
  Animated,
  Platform,
} from "react-native";
import Constants from 'expo-constants';
import {
  IdentityCaptureProvider,
  captureAndExtract,
  DocumentCaptureResult,
  SelfieCaptureResult,
  arabicStrings,
  frenchStrings,
  CameraManager,
  SelfieManager,
  IdentityCaptureConfig,
  initCloudVision,
  recognizeText,
  getCloudVisionConfig,
  detectAndParseMRZ,
  getCountryName,
  formatSex,
  extractFieldsFromOCR,
} from "expo-identity-capture";
import type {
  VerifiedDocType,
  CaptureError,
  OcrField,
  ParsedMRZ,
  NormalizedField,
  ExtractedFieldsWithNormalization,
} from "expo-identity-capture";

// Initialize Google Cloud Vision API for Arabic OCR support
const GOOGLE_CLOUD_VISION_API_KEY = Constants.expoConfig?.extra?.googleCloudVisionApiKey;

if (GOOGLE_CLOUD_VISION_API_KEY) {
  initCloudVision({
    apiKey: GOOGLE_CLOUD_VISION_API_KEY,
    languageHints: ['ar', 'en', 'fr'],
    timeout: 10000,
  });
  console.log('[App] Cloud Vision initialized');
} else {
  console.warn('[App] GOOGLE_CLOUD_VISION_API_KEY not found in app.json extra config');
}

/** Field with both raw OCR value and normalized/formatted value */
interface FieldValue {
  raw: string;
  formatted: string;
}

interface ExtractedFields {
  rawText?: string;
  detectedLanguages?: string[];
  /** Raw parsed fields (before normalization) - for debugging */
  rawFields?: {
    documentNumber?: string;
    fullName?: string;
    fullNameArabic?: string;
    givenNames?: string;
    surname?: string;
    dateOfBirth?: string;
    nationality?: string;
    placeOfBirth?: string;
    fatherName?: string;
    motherName?: string;
    dateOfIssue?: string;
    dateOfExpiry?: string;
    gender?: string;
    profession?: string;
  };
  /** Normalized fields with both raw and formatted values */
  normalizedFields?: {
    documentNumber?: FieldValue;
    fullName?: FieldValue;
    fullNameArabic?: FieldValue;
    givenNames?: FieldValue;
    surname?: FieldValue;
    dateOfBirth?: FieldValue;
    nationality?: FieldValue;
    placeOfBirth?: FieldValue;
    fatherName?: FieldValue;
    motherName?: FieldValue;
    dateOfIssue?: FieldValue;
    dateOfExpiry?: FieldValue;
    gender?: FieldValue;
    profession?: FieldValue;
  };
  // MRZ specific data (for passports and some IDs)
  mrz?: {
    found: boolean;
    type?: 'TD1' | 'TD2' | 'TD3';
    raw?: string;
    parsed?: ParsedMRZ;
    isValid?: boolean;
    confidence?: number;
  };
}

interface CaptureResult {
  type: "document" | "selfie";
  data: DocumentCaptureResult | SelfieCaptureResult;
  timestamp: string;
  extractedFields?: ExtractedFields;
}

// Custom configuration for demo
const demoConfig: IdentityCaptureConfig = {
  theme: {
    colors: {
      primary: "#007AFF",
      secondary: "#34C759",
      danger: "#FF3B30",
      // You can customize these colors
      // primary: '#FF5722', // Orange theme
      // secondary: '#4CAF50', // Green theme
    },
    animation: {
      progress: {
        duration: 2000, // Slower animation for demo
      },
    },
    // layout: {
    // frame: {
    // Custom frame sizes for demo
    // passport: { top: "25%", left: "15%", right: "15%", height: "45%" },
    // civil_register: {
    //   top: "30%",
    //   left: "15%",
    //   right: "15%",
    //   height: "25%",
    // },
    // },
    // Responsive button sizes (will be scaled based on device)
    // buttons: {
    // capture: { width: 80, height: 80 }, // Slightly larger for demo
    // header: { width: 50, height: 50 }, // Smaller header buttons
    // },
    // Responsive spacing
    // spacing: {
    // sm: 12, // Larger small spacing
    // md: 20, // Larger medium spacing
    // lg: 28, // Larger large spacing
    // },
    // },
    // typography: {
    // Custom responsive font sizes
    // sizes: {
    // base: 17, // Slightly larger base font
    // lg: 20, // Larger header fonts
    // xl: 26, // Larger title fonts
    // },
    // },
  },
  localization: {
    language: "en",
    // customStrings: {
    //   en: {
    //     documentLabels: {
    //       passport: "Travel Passport",
    //       civil_id: "National ID",
    //       civil_register: "Birth Certificate",
    //     },
    //     instructions: {
    //       passport:
    //         "Position your passport within the frame and ensure all text is clearly visible.",
    //       civil_register:
    //         "Hold your birth certificate steady within the square frame.",
    //     },
    //     alerts: {
    //       captureSuccess: "Document captured successfully! 🎉",
    //       captureFailed: "Capture failed. Please try again.",
    //     },
    //   },
    //   ar: {
    //     documentLabels: {
    //       passport: "جواز سفر",
    //       civil_id: "الهوية الوطنية",
    //       civil_register: "شهادة ميلاد",
    //     },
    //     instructions: {
    //       passport: "ضع جواز سفرك داخل الإطار وتأكد من وضوح جميع النصوص.",
    //       civil_register: "أمسك شهادة الميلاد بثبات داخل الإطار المربع.",
    //     },
    //   },
    // },
  },
  behavior: {
    detection: {
      ocr: {
        timeout: 8000, // Longer timeout for demo
        minTextLength: 5, // More lenient for demo
      },
    },
  },
};

export default function App() {
  const [results, setResults] = useState<CaptureResult[]>([]);
  const [language, setLanguage] = useState<"en" | "ar" | "fr">("en");
  const [useCustomCapture, setUseCustomCapture] = useState(true);
  const [disableDetection, setDisableDetection] = useState(false);
  const [enableFlash, setEnableFlash] = useState(true);
  const [enableOCRValidation, setEnableOCRValidation] = useState(false);
  const [enableLivenessDetection, setEnableLivenessDetection] = useState(false);
  const [blockOnLivenessFail, setBlockOnLivenessFail] = useState(false);
  const [showCustomCamera, setShowCustomCamera] = useState(false);
  const [showSelfieCapture, setShowSelfieCapture] = useState(false);
  const [pendingDocType, setPendingDocType] = useState<VerifiedDocType | null>(
    null
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageTitle, setSelectedImageTitle] = useState<string>("");
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const imageScrollRef = useRef<ScrollView>(null);

  // Perform OCR extraction on captured image using the new library extractor
  const performOcrExtraction = async (imageUri: string, docType: VerifiedDocType): Promise<ExtractedFields | undefined> => {
    if (!getCloudVisionConfig()) {
      console.log('[OCR] Cloud Vision not configured, skipping extraction');
      return undefined;
    }

    try {
      console.log('[OCR] Extracting text from captured image...');
      const ocrResult = await recognizeText(imageUri, ['ar', 'en', 'fr']);

      // Use the library's field extractor with normalization
      const extractedData = extractFieldsFromOCR(ocrResult.text, docType);

      console.log('[OCR] Raw extracted fields:', extractedData.raw);
      console.log('[OCR] Normalized fields:', extractedData.normalized);

      // Convert to our interface format
      const normalizedFields: ExtractedFields['normalizedFields'] = {};

      // Map normalized fields
      if (extractedData.normalized.documentNumber) {
        normalizedFields.documentNumber = extractedData.normalized.documentNumber;
      }
      if (extractedData.normalized.fullName) {
        normalizedFields.fullName = extractedData.normalized.fullName;
      }
      if (extractedData.normalized.fullNameArabic) {
        normalizedFields.fullNameArabic = extractedData.normalized.fullNameArabic;
      }
      if (extractedData.normalized.givenNames) {
        normalizedFields.givenNames = extractedData.normalized.givenNames;
      }
      if (extractedData.normalized.surname) {
        normalizedFields.surname = extractedData.normalized.surname;
      }
      if (extractedData.normalized.dateOfBirth) {
        normalizedFields.dateOfBirth = extractedData.normalized.dateOfBirth;
      }
      if (extractedData.normalized.dateOfExpiry) {
        normalizedFields.dateOfExpiry = extractedData.normalized.dateOfExpiry;
      }
      if (extractedData.normalized.dateOfIssue) {
        normalizedFields.dateOfIssue = extractedData.normalized.dateOfIssue;
      }
      if (extractedData.normalized.nationality) {
        normalizedFields.nationality = extractedData.normalized.nationality;
      }
      if (extractedData.normalized.placeOfBirth) {
        normalizedFields.placeOfBirth = extractedData.normalized.placeOfBirth;
      }
      if (extractedData.normalized.fatherName) {
        normalizedFields.fatherName = extractedData.normalized.fatherName;
      }
      if (extractedData.normalized.motherName) {
        normalizedFields.motherName = extractedData.normalized.motherName;
      }
      if (extractedData.normalized.gender) {
        normalizedFields.gender = {
          raw: extractedData.normalized.gender.raw,
          formatted: extractedData.normalized.gender.formatted,
        };
      }
      if (extractedData.normalized.profession) {
        normalizedFields.profession = extractedData.normalized.profession;
      }

      // Try to detect and parse MRZ (mainly for passports, but also some IDs)
      let mrzData: ExtractedFields['mrz'] = undefined;

      if (docType === 'passport' || docType === 'civil_id' || docType === 'residence_permit') {
        console.log('[MRZ] Attempting MRZ detection...');
        const mrzResult = detectAndParseMRZ(ocrResult.text);

        if (mrzResult.found && mrzResult.parsed) {
          console.log('[MRZ] ✅ MRZ detected and parsed:', {
            type: mrzResult.type,
            name: mrzResult.parsed.fullName,
            documentNumber: mrzResult.parsed.documentNumber,
            isValid: mrzResult.parsed.isValid,
            confidence: `${(mrzResult.parsed.confidence * 100).toFixed(0)}%`,
          });

          mrzData = {
            found: true,
            type: mrzResult.type,
            raw: mrzResult.parsed.raw,
            parsed: mrzResult.parsed,
            isValid: mrzResult.parsed.isValid,
            confidence: mrzResult.parsed.confidence,
          };

          // If MRZ was successfully parsed, prefer MRZ data over OCR text parsing
          // MRZ data is more reliable and structured
          if (mrzResult.parsed.isValid) {
            normalizedFields.documentNumber = {
              raw: mrzResult.parsed.documentNumber,
              formatted: mrzResult.parsed.documentNumber,
            };
            normalizedFields.fullName = {
              raw: mrzResult.parsed.fullName,
              formatted: mrzResult.parsed.fullName,
            };
            normalizedFields.dateOfBirth = {
              raw: mrzResult.parsed.dateOfBirthRaw,
              formatted: mrzResult.parsed.dateOfBirth,
            };
            normalizedFields.dateOfExpiry = {
              raw: mrzResult.parsed.dateOfExpiryRaw,
              formatted: mrzResult.parsed.dateOfExpiry,
            };
            normalizedFields.nationality = {
              raw: mrzResult.parsed.nationality,
              formatted: getCountryName(mrzResult.parsed.nationality),
            };
            normalizedFields.gender = {
              raw: mrzResult.parsed.sex,
              formatted: formatSex(mrzResult.parsed.sex),
            };
          }
        } else {
          console.log('[MRZ] No MRZ found in document');
          mrzData = { found: false };
        }
      }

      return {
        rawText: ocrResult.text,
        detectedLanguages: ocrResult.detectedLanguages,
        rawFields: extractedData.raw,
        normalizedFields,
        mrz: mrzData,
      };
    } catch (error) {
      console.error('[OCR] Extraction failed:', error);
      return undefined;
    }
  };

  const getLanguageStrings = () => {
    switch (language) {
      case "ar":
        return arabicStrings;
      case "fr":
        return frenchStrings;
      default:
        return undefined;
    }
  };

  const handleDocumentCapture = async (documentType: VerifiedDocType) => {
    try {
      console.log("📱 Document capture triggered:", {
        documentType,
        useCustomCapture,
      });

      // If using custom capture, show the custom camera view
      if (useCustomCapture) {
        console.log(
          "📷 Opening custom camera modal... (DocumentScanner will NOT be called)"
        );
        setPendingDocType(documentType);
        setShowCustomCamera(true);
        return;
      }

      console.log("📄 Using regular document scanner plugin...");

      // Regular capture with document scanner plugin
      const result = await captureAndExtract({
        docHint: documentType,
        enableQualityCheck: true,
        useCustomCapture: false,
        enableFlash: enableFlash,
      });

      console.log("Document captured and extracted:", result);

      // Add the result to the results list for display
      setResults((prev) => [
        ...prev,
        {
          type: "document",
          data: {
            type: documentType as any,
            images: [result.originalImageUri, result.croppedImageUri],
            originalImageUri: result.originalImageUri,
            croppedImageUri: result.croppedImageUri,
            capturedAt: new Date().toISOString(),
            metadata: {
              extractedFields: Object.keys(result.fields).length,
              quality: result.quality,
            },
          } as DocumentCaptureResult,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  };

  const handleCustomCameraCapture = async (result: { originalImageUri: string; croppedImageUri: string }) => {
    console.log("📸 Custom camera captured:", result);
    setShowCustomCamera(false);

    if (pendingDocType) {
      try {
        console.log("🎉 Real photo captured! Extracting text...");

        // Perform OCR extraction on the cropped image
        const extractedFields = await performOcrExtraction(result.croppedImageUri, pendingDocType);

        if (extractedFields) {
          console.log("📝 Raw fields:", extractedFields.rawFields);
          console.log("📝 Normalized fields:", extractedFields.normalizedFields);
          console.log("🌐 Detected languages:", extractedFields.detectedLanguages);
        }

        // Count how many fields were extracted
        const fieldCount = extractedFields?.normalizedFields
          ? Object.values(extractedFields.normalizedFields).filter(Boolean).length
          : 0;

        // Add the result with extracted fields
        setResults((prev) => [
          ...prev,
          {
            type: "document",
            data: {
              type: pendingDocType as any,
              images: [result.originalImageUri, result.croppedImageUri],
              originalImageUri: result.originalImageUri,
              croppedImageUri: result.croppedImageUri,
              capturedAt: new Date().toISOString(),
              metadata: {
                extractedFields: fieldCount,
                quality: { blurScore: 0, brightness: 0, glareDetected: false },
              },
            } as DocumentCaptureResult,
            timestamp: new Date().toISOString(),
            extractedFields,
          },
        ]);
      } catch (error) {
        Alert.alert(
          "Error",
          error instanceof Error ? error.message : "Failed to process document"
        );
      }
    }

    setPendingDocType(null);
  };

  const handleCustomCameraCancel = () => {
    console.log("Custom camera cancelled");
    setShowCustomCamera(false);
    setPendingDocType(null);
  };

  const handleCameraError = (error: CaptureError) => {
    console.log("Camera error:", error);

    let title = "Capture Error";
    let message = error.message;

    switch (error.code) {
      case "TEMPLATE_INVALID":
        title = "Template Configuration Error";
        message = `The document template is invalid or misconfigured.\n\n${error.details || "Please contact support if this issue persists."}`;
        break;
      case "CROP_FAILED":
        title = "Image Processing Error";
        message = `Failed to process the captured image.\n\n${error.details || "The original image has been saved."}`;
        break;
      case "CAPTURE_FAILED":
        title = "Capture Failed";
        message = `Unable to capture the document.\n\n${error.details || "Please try again."}`;
        break;
      default:
        title = "Unknown Error";
        message = error.details || "An unexpected error occurred.";
    }

    Alert.alert(title, message, [{ text: "OK" }]);
  };

  const handleSelfieCapture = async () => {
    try {
      console.log("📱 Selfie capture initiated");

      // Show the new custom selfie capture modal
      setShowSelfieCapture(true);
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to initiate selfie capture"
      );
    }
  };

  const handleCustomSelfieCapture = async (result: { originalImageUri: string; croppedImageUri: string }) => {
    console.log("📸 Custom selfie captured:", result);
    setShowSelfieCapture(false);

    try {
      const selfieResult: SelfieCaptureResult = {
        image: result.originalImageUri,
        croppedImage: result.croppedImageUri,
        capturedAt: new Date().toISOString(),
      };

      console.log("Selfie captured successfully:", selfieResult);
      setResults((prev) => [
        ...prev,
        {
          type: "selfie",
          data: selfieResult,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to process selfie"
      );
    }
  };

  const handleCustomSelfieCancel = () => {
    console.log("Custom selfie capture cancelled");
    setShowSelfieCapture(false);
  };

  const clearResults = () => {
    setResults([]);
  };

  const handleImagePress = (imageUri: string, title: string = "Image") => {
    if (imageUri) {
      setSelectedImage(imageUri);
      setSelectedImageTitle(title);
      setImageZoom(1);
      setShowImageModal(true);
    } else {
      Alert.alert('Image not available', 'This image could not be loaded.');
    }
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedImage(null);
    setSelectedImageTitle("");
    setImageZoom(1);
  };

  const handleZoomIn = () => {
    setImageZoom(prev => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setImageZoom(prev => Math.max(prev - 0.5, 0.5));
  };

  const handleResetZoom = () => {
    setImageZoom(1);
    imageScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
  };


  return (
    <IdentityCaptureProvider config={demoConfig}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.title}>Identity Capture Demo</Text>

          {/* Language Selection */}
          <View style={styles.languageContainer}>
            <Text style={styles.sectionTitle}>Language:</Text>
            <View style={styles.languageButtons}>
              {(["en", "ar", "fr"] as const).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.languageButton,
                    language === lang && styles.activeLanguageButton,
                  ]}
                  onPress={() => setLanguage(lang)}
                >
                  <Text
                    style={[
                      styles.languageButtonText,
                      language === lang && styles.activeLanguageButtonText,
                    ]}
                  >
                    {lang.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom Capture Toggle */}
          <View style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>Use Custom OpenCV Capture:</Text>
            <Switch
              value={useCustomCapture}
              onValueChange={setUseCustomCapture}
              trackColor={{ false: "#767577", true: "#81b0ff" }}
              thumbColor={useCustomCapture ? "#007AFF" : "#f4f3f4"}
            />
          </View>
          {useCustomCapture && (
            <Text style={styles.toggleInfo}>
              ℹ️ Custom camera with real photo capture • Cancel + Flash only •
              Manual capture
            </Text>
          )}

          {/* Disable Detection Toggle - only show when custom capture is enabled */}
          {useCustomCapture && (
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>
                Disable Document Detection:
              </Text>
              <Switch
                value={disableDetection}
                onValueChange={setDisableDetection}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={disableDetection ? "#007AFF" : "#f4f3f4"}
              />
            </View>
          )}
          {useCustomCapture && disableDetection && (
            <Text style={styles.toggleInfo}>
              ℹ️ Detection disabled - simple photo capture without positioning
              guides
            </Text>
          )}

          {/* Enable Flash Toggle - only show when custom capture is enabled */}
          {useCustomCapture && (
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>Enable Flash Button:</Text>
              <Switch
                value={enableFlash}
                onValueChange={setEnableFlash}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={enableFlash ? "#007AFF" : "#f4f3f4"}
              />
            </View>
          )}

          {/* OCR Validation Toggle - only show when custom capture is enabled */}
          {useCustomCapture && (
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>Enable OCR Validation:</Text>
              <Switch
                value={enableOCRValidation}
                onValueChange={setEnableOCRValidation}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={enableOCRValidation ? "#007AFF" : "#f4f3f4"}
              />
            </View>
          )}
          {useCustomCapture && !enableFlash && (
            <Text style={styles.toggleInfo}>
              ℹ️ Flash button disabled - camera will use auto lighting only
            </Text>
          )}
          {useCustomCapture && enableOCRValidation && (
            <Text style={styles.toggleInfo}>
              ℹ️ OCR validation enabled - will verify document type before capture
            </Text>
          )}
          {useCustomCapture && !enableOCRValidation && (
            <Text style={styles.toggleInfo}>
              ℹ️ OCR validation disabled - will capture without document verification
            </Text>
          )}

          {/* Liveness Detection Toggle */}
          {useCustomCapture && (
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>Enable Liveness Detection:</Text>
              <Switch
                value={enableLivenessDetection}
                onValueChange={setEnableLivenessDetection}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={enableLivenessDetection ? "#007AFF" : "#f4f3f4"}
              />
            </View>
          )}
          {useCustomCapture && enableLivenessDetection && (
            <Text style={styles.toggleInfo}>
              ℹ️ Liveness detection enabled - will detect screen captures/digital copies
            </Text>
          )}

          {/* Block on Liveness Fail Toggle - only show when liveness is enabled */}
          {useCustomCapture && enableLivenessDetection && (
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleLabel}>Block on Liveness Fail:</Text>
              <Switch
                value={blockOnLivenessFail}
                onValueChange={setBlockOnLivenessFail}
                trackColor={{ false: "#767577", true: "#ff6b6b" }}
                thumbColor={blockOnLivenessFail ? "#FF3B30" : "#f4f3f4"}
              />
            </View>
          )}
          {useCustomCapture && enableLivenessDetection && blockOnLivenessFail && (
            <Text style={styles.toggleInfo}>
              ⚠️ Capture will be blocked if liveness check fails (screen/digital copy detected)
            </Text>
          )}
          {useCustomCapture && enableLivenessDetection && !blockOnLivenessFail && (
            <Text style={styles.toggleInfo}>
              ℹ️ Liveness results will be logged but capture won't be blocked
            </Text>
          )}

          {/* Document Capture Buttons */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Document Capture</Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => handleDocumentCapture("passport")}
            >
              <Text style={styles.buttonText}>📘 Capture Passport</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => handleDocumentCapture("civil_id")}
            >
              <Text style={styles.buttonText}>🆔 Capture Civil ID</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => handleDocumentCapture("army_card")}
            >
              <Text style={styles.buttonText}>🪖 Capture Army Card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => handleDocumentCapture("residence_permit")}
            >
              <Text style={styles.buttonText}>🏠 Capture Residence Permit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => handleDocumentCapture("civil_register")}
            >
              <Text style={styles.buttonText}>📋 Capture Civil Register</Text>
            </TouchableOpacity>
          </View>

          {/* Selfie Capture Button */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selfie Capture</Text>

            <TouchableOpacity
              style={[styles.button, styles.selfieButton]}
              onPress={handleSelfieCapture}
            >
              <Text style={styles.buttonText}>🤳 Capture Selfie</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          <View style={styles.section}>
            <View style={styles.resultsHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Results ({results.length})
                </Text>
                {results.length > 0 && (
                  <Text style={styles.resultsTip}>
                    Tap images to preview in fullscreen
                  </Text>
                )}
              </View>
              {results.length > 0 && (
                <TouchableOpacity
                  onPress={clearResults}
                  style={styles.clearButton}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {results.length === 0 ? (
              <Text style={styles.emptyText}>No captures yet</Text>
            ) : (
              results.map((result, index) => (
                <View key={index} style={styles.resultItem}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultType}>
                      {result.type === "document"
                        ? `📄 ${(
                            result.data as DocumentCaptureResult
                          ).type.toUpperCase()}`
                        : "🤳 SELFIE"}
                    </Text>
                    <Text style={styles.resultTime}>
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </Text>
                    <Text style={styles.resultDetails}>
                      {result.type === "document"
                        ? `${
                            (result.data as DocumentCaptureResult).images.length
                          } image(s)`
                        : "1 image"}
                    </Text>
                  </View>
                  
                  {/* Image Display Section - Always visible */}
                  <View style={styles.imageSection}>
                    {result.type === "document" ? (
                    <View style={styles.imageContainer}>
                      {(result.data as DocumentCaptureResult).originalImageUri && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Original</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as DocumentCaptureResult).originalImageUri!,
                              `Original - ${(result.data as DocumentCaptureResult).type.toUpperCase()}`
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as DocumentCaptureResult).originalImageUri }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                      {(result.data as DocumentCaptureResult).croppedImageUri && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Cropped</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as DocumentCaptureResult).croppedImageUri!,
                              `Cropped - ${(result.data as DocumentCaptureResult).type.toUpperCase()}`
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as DocumentCaptureResult).croppedImageUri }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                      {/* Fallback to images array if specific URIs not available */}
                      {!(result.data as DocumentCaptureResult).originalImageUri && 
                       (result.data as DocumentCaptureResult).images.length > 0 && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Captured Image</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as DocumentCaptureResult).images[0],
                              `Captured - ${(result.data as DocumentCaptureResult).type.toUpperCase()}`
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as DocumentCaptureResult).images[0] }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.imageContainer}>
                      {(result.data as SelfieCaptureResult).croppedImage && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Original</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as SelfieCaptureResult).image,
                              "Original Selfie"
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as SelfieCaptureResult).image }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                      {(result.data as SelfieCaptureResult).croppedImage && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Cropped</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as SelfieCaptureResult).croppedImage!,
                              "Cropped Selfie"
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as SelfieCaptureResult).croppedImage }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                      {/* Fallback if no cropped image */}
                      {!(result.data as SelfieCaptureResult).croppedImage && (
                        <View style={styles.imageWrapper}>
                          <Text style={styles.imageLabel}>Selfie</Text>
                          <TouchableOpacity
                            onPress={() => handleImagePress(
                              (result.data as SelfieCaptureResult).image,
                              "Original Selfie"
                            )}
                          >
                            <Image
                              source={{ uri: (result.data as SelfieCaptureResult).image }}
                              style={styles.capturedImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                  </View>

                  {/* Extracted Fields Section */}
                  {result.type === "document" && result.extractedFields && (
                    <View style={styles.extractedFieldsSection}>
                      <Text style={styles.extractedFieldsTitle}>📝 Extracted Information</Text>

                      {result.extractedFields.detectedLanguages && result.extractedFields.detectedLanguages.length > 0 && (
                        <Text style={styles.detectedLanguages}>
                          Languages: {result.extractedFields.detectedLanguages.join(', ')}
                        </Text>
                      )}

                      {result.extractedFields.normalizedFields && (
                        <View style={styles.fieldsContainer}>
                          {/* Full Name */}
                          {result.extractedFields.normalizedFields.fullName && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Full Name:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.fullName.formatted}
                                </Text>
                                {result.extractedFields.normalizedFields.fullName.raw !== result.extractedFields.normalizedFields.fullName.formatted && (
                                  <Text style={styles.fieldValueRaw}>
                                    Raw: {result.extractedFields.normalizedFields.fullName.raw}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                          {/* Given Names */}
                          {result.extractedFields.normalizedFields.givenNames && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Given Names:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.givenNames.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Surname */}
                          {result.extractedFields.normalizedFields.surname && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Surname:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.surname.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Document Number */}
                          {result.extractedFields.normalizedFields.documentNumber && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Document #:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.documentNumber.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Date of Birth */}
                          {result.extractedFields.normalizedFields.dateOfBirth && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Date of Birth:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.dateOfBirth.formatted}
                                </Text>
                                {result.extractedFields.normalizedFields.dateOfBirth.raw !== result.extractedFields.normalizedFields.dateOfBirth.formatted && (
                                  <Text style={styles.fieldValueRaw}>
                                    Raw: {result.extractedFields.normalizedFields.dateOfBirth.raw}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                          {/* Nationality */}
                          {result.extractedFields.normalizedFields.nationality && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Nationality:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.nationality.formatted}
                                </Text>
                                {result.extractedFields.normalizedFields.nationality.raw !== result.extractedFields.normalizedFields.nationality.formatted && (
                                  <Text style={styles.fieldValueRaw}>
                                    Raw: {result.extractedFields.normalizedFields.nationality.raw}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                          {/* Gender */}
                          {result.extractedFields.normalizedFields.gender && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Gender:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.gender.formatted}
                                </Text>
                                {result.extractedFields.normalizedFields.gender.raw !== result.extractedFields.normalizedFields.gender.formatted && (
                                  <Text style={styles.fieldValueRaw}>
                                    Raw: {result.extractedFields.normalizedFields.gender.raw}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                          {/* Date of Expiry */}
                          {result.extractedFields.normalizedFields.dateOfExpiry && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Expiry Date:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.dateOfExpiry.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Place of Birth */}
                          {result.extractedFields.normalizedFields.placeOfBirth && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Place of Birth:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.placeOfBirth.formatted}
                                </Text>
                                {result.extractedFields.normalizedFields.placeOfBirth.raw !== result.extractedFields.normalizedFields.placeOfBirth.formatted && (
                                  <Text style={styles.fieldValueRaw}>
                                    Raw: {result.extractedFields.normalizedFields.placeOfBirth.raw}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                          {/* Father's Name */}
                          {result.extractedFields.normalizedFields.fatherName && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Father:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.fatherName.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Mother's Name */}
                          {result.extractedFields.normalizedFields.motherName && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Mother:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.motherName.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                          {/* Profession */}
                          {result.extractedFields.normalizedFields.profession && (
                            <View style={styles.normalizedFieldRow}>
                              <Text style={styles.fieldLabel}>Profession:</Text>
                              <View style={styles.fieldValues}>
                                <Text style={styles.fieldValueFormatted}>
                                  {result.extractedFields.normalizedFields.profession.formatted}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      )}

                      {/* MRZ Section - for passports and IDs with machine readable zones */}
                      {result.extractedFields.mrz?.found && result.extractedFields.mrz.parsed && (
                        <View style={styles.mrzSection}>
                          <View style={styles.mrzHeader}>
                            <Text style={styles.mrzTitle}>🔐 MRZ Data</Text>
                            <View style={[
                              styles.mrzValidBadge,
                              { backgroundColor: result.extractedFields.mrz.isValid ? '#34C759' : '#FF9500' }
                            ]}>
                              <Text style={styles.mrzValidText}>
                                {result.extractedFields.mrz.isValid ? '✓ Valid' : '⚠ Partial'}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.mrzTypeText}>
                            Type: {result.extractedFields.mrz.type} ({result.extractedFields.mrz.type === 'TD3' ? 'Passport' : 'ID Card'})
                            {' • '}Confidence: {((result.extractedFields.mrz.confidence || 0) * 100).toFixed(0)}%
                          </Text>

                          <View style={styles.mrzFieldsContainer}>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Full Name:</Text>
                              <Text style={styles.fieldValue}>{result.extractedFields.mrz.parsed.fullName}</Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Document #:</Text>
                              <Text style={styles.fieldValue}>{result.extractedFields.mrz.parsed.documentNumber}</Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Nationality:</Text>
                              <Text style={styles.fieldValue}>
                                {getCountryName(result.extractedFields.mrz.parsed.nationality)} ({result.extractedFields.mrz.parsed.nationality})
                              </Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Date of Birth:</Text>
                              <Text style={styles.fieldValue}>{result.extractedFields.mrz.parsed.dateOfBirth}</Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Date of Expiry:</Text>
                              <Text style={styles.fieldValue}>{result.extractedFields.mrz.parsed.dateOfExpiry}</Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Sex:</Text>
                              <Text style={styles.fieldValue}>{formatSex(result.extractedFields.mrz.parsed.sex)}</Text>
                            </View>
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Issuing Country:</Text>
                              <Text style={styles.fieldValue}>
                                {getCountryName(result.extractedFields.mrz.parsed.issuingCountry)} ({result.extractedFields.mrz.parsed.issuingCountry})
                              </Text>
                            </View>
                          </View>

                          {/* Check Digits Status */}
                          <View style={styles.checkDigitsContainer}>
                            <Text style={styles.checkDigitsTitle}>Check Digits:</Text>
                            <View style={styles.checkDigitsRow}>
                              <Text style={[styles.checkDigit, result.extractedFields.mrz.parsed.checkDigits.documentNumber && styles.checkDigitValid]}>
                                Doc# {result.extractedFields.mrz.parsed.checkDigits.documentNumber ? '✓' : '✗'}
                              </Text>
                              <Text style={[styles.checkDigit, result.extractedFields.mrz.parsed.checkDigits.dateOfBirth && styles.checkDigitValid]}>
                                DOB {result.extractedFields.mrz.parsed.checkDigits.dateOfBirth ? '✓' : '✗'}
                              </Text>
                              <Text style={[styles.checkDigit, result.extractedFields.mrz.parsed.checkDigits.dateOfExpiry && styles.checkDigitValid]}>
                                Expiry {result.extractedFields.mrz.parsed.checkDigits.dateOfExpiry ? '✓' : '✗'}
                              </Text>
                              <Text style={[styles.checkDigit, result.extractedFields.mrz.parsed.checkDigits.composite && styles.checkDigitValid]}>
                                Total {result.extractedFields.mrz.parsed.checkDigits.composite ? '✓' : '✗'}
                              </Text>
                            </View>
                          </View>

                          {/* Raw MRZ */}
                          <View style={styles.rawMrzSection}>
                            <Text style={styles.rawMrzTitle}>Raw MRZ:</Text>
                            <Text style={styles.rawMrzText}>{result.extractedFields.mrz.raw}</Text>
                          </View>
                        </View>
                      )}

                      {/* Show raw text in expandable section */}
                      {result.extractedFields.rawText && (
                        <View style={styles.rawTextSection}>
                          <Text style={styles.rawTextTitle}>Raw OCR Text:</Text>
                          <Text style={styles.rawTextContent} numberOfLines={5}>
                            {result.extractedFields.rawText}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Custom Camera Modal */}
        <CameraManager
          visible={showCustomCamera}
          docType={pendingDocType || "passport"}
          onCapture={handleCustomCameraCapture}
          onCancel={handleCustomCameraCancel}
          onError={handleCameraError}
          disableDetection={disableDetection}
          enableFlash={enableFlash}
          enableOCRValidation={enableOCRValidation}
          enableLivenessDetection={enableLivenessDetection}
          blockOnLivenessFail={blockOnLivenessFail}
        />

        {/* Custom Selfie Modal */}
        <SelfieManager
          visible={showSelfieCapture}
          onCapture={handleCustomSelfieCapture}
          onCancel={handleCustomSelfieCancel}
          enableFlash={enableFlash}
          enableLivenessDetection={enableLivenessDetection}
          blockOnLivenessFail={blockOnLivenessFail}
        />

        {/* Enhanced Image Preview Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={showImageModal}
          onRequestClose={closeImageModal}
        >
          <View style={styles.modalOverlay}>
            {/* Header with title and close button */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedImageTitle}</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={closeImageModal}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable image container */}
            <ScrollView
              ref={imageScrollRef}
              style={styles.imageScrollContainer}
              contentContainerStyle={styles.imageScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={0.5}
              showsHorizontalScrollIndicator={true}
              showsVerticalScrollIndicator={true}
              centerContent={true}
              bounces={false}
              pinchGestureEnabled={true}
              zoomScale={imageZoom}
            >
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={[
                    styles.fullscreenImage,
                    {
                      width: Dimensions.get('window').width * imageZoom,
                      height: Dimensions.get('window').height * 0.7 * imageZoom,
                    }
                  ]}
                  resizeMode="contain"
                />
              )}
            </ScrollView>

            {/* Zoom controls */}
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={handleZoomOut}
              >
                <Text style={styles.zoomButtonText}>−</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.zoomButton, styles.resetButton]}
                onPress={handleResetZoom}
              >
                <Text style={styles.zoomButtonText}>Reset</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={handleZoomIn}
              >
                <Text style={styles.zoomButtonText}>+</Text>
              </TouchableOpacity>
              
              <View style={styles.zoomInfo}>
                <Text style={styles.zoomInfoText}>{Math.round(imageZoom * 100)}%</Text>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </IdentityCaptureProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#333",
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 15,
    color: "#333",
  },
  languageContainer: {
    marginBottom: 30,
  },
  languageButtons: {
    flexDirection: "row",
    gap: 10,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 20,
  },
  activeLanguageButton: {
    backgroundColor: "#007AFF",
  },
  languageButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  activeLanguageButtonText: {
    color: "white",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  toggleInfo: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  selfieButton: {
    backgroundColor: "#34C759",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  resultsTip: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginTop: 4,
  },
  clearButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    fontStyle: "italic",
    padding: 20,
  },
  resultItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  resultHeader: {
    marginBottom: 15,
  },
  imageSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  resultType: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  resultTime: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  resultDetails: {
    fontSize: 14,
    color: "#007AFF",
    marginTop: 4,
  },
  imageContainer: {
    flexDirection: "row",
    marginTop: 15,
    gap: 10,
  },
  imageWrapper: {
    flex: 1,
    alignItems: "center",
  },
  imageLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 5,
    textAlign: "center",
  },
  capturedImage: {
    width: 100,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === "ios" ? 50 : 15,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "white",
    flex: 1,
  },
  modalCloseButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  imageScrollContainer: {
    flex: 1,
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    alignSelf: "center",
  },
  zoomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    gap: 15,
  },
  zoomButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  resetButton: {
    paddingHorizontal: 20,
    width: "auto",
  },
  zoomButtonText: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
  },
  zoomInfo: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 15,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginLeft: 10,
  },
  zoomInfoText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
  // Extracted Fields Styles
  extractedFieldsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  extractedFieldsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  detectedLanguages: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    fontStyle: "italic",
  },
  fieldsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 10,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.05)",
  },
  normalizedFieldRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.05)",
  },
  fieldLabel: {
    fontSize: 13,
    color: "#666",
    flex: 1,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
    flex: 2,
    textAlign: "right",
  },
  fieldValues: {
    flex: 1,
  },
  fieldValueFormatted: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a365d",
  },
  fieldValueRaw: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
    fontStyle: "italic",
  },
  rawTextSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  rawTextTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  rawTextContent: {
    fontSize: 11,
    color: "#888",
    lineHeight: 16,
  },
  // MRZ Section Styles
  mrzSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
    backgroundColor: "#f0f4f8",
    borderRadius: 8,
    padding: 12,
    marginHorizontal: -4,
  },
  mrzHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  mrzTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a365d",
  },
  mrzValidBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mrzValidText: {
    fontSize: 12,
    fontWeight: "600",
    color: "white",
  },
  mrzTypeText: {
    fontSize: 12,
    color: "#4a5568",
    marginBottom: 10,
  },
  mrzFieldsContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  checkDigitsContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  checkDigitsTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4a5568",
    marginBottom: 6,
  },
  checkDigitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  checkDigit: {
    fontSize: 10,
    color: "#e53e3e",
    backgroundColor: "rgba(229, 62, 62, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  checkDigitValid: {
    color: "#38a169",
    backgroundColor: "rgba(56, 161, 105, 0.1)",
  },
  rawMrzSection: {
    backgroundColor: "#1a202c",
    borderRadius: 6,
    padding: 10,
  },
  rawMrzTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#a0aec0",
    marginBottom: 6,
  },
  rawMrzText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: "#68d391",
    lineHeight: 14,
  },
});
