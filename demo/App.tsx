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
} from "expo-identity-capture";
import type { VerifiedDocType } from "expo-identity-capture";

interface CaptureResult {
  type: "document" | "selfie";
  data: DocumentCaptureResult | SelfieCaptureResult;
  timestamp: string;
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
        console.log("🎉 Real photo captured! Custom capture complete.");

        // Since we have the real captured image from custom camera,
        // we don't need to call DocumentScanner.scanDocument again
        // Just add the result to show the custom capture worked
        setResults((prev) => [
          ...prev,
          {
            type: "document",
            data: {
              type: pendingDocType as any,
              images: [result.originalImageUri, result.croppedImageUri], // Use both images
              originalImageUri: result.originalImageUri,
              croppedImageUri: result.croppedImageUri,
              capturedAt: new Date().toISOString(),
              metadata: {
                extractedFields: 0, // Custom capture complete - would need OCR processing for field extraction
                quality: { blurScore: 0, brightness: 0, glareDetected: false },
              },
            } as DocumentCaptureResult,
            timestamp: new Date().toISOString(),
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
          {useCustomCapture && !enableFlash && (
            <Text style={styles.toggleInfo}>
              ℹ️ Flash button disabled - camera will use auto lighting only
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
          disableDetection={disableDetection}
          enableFlash={enableFlash}
        />

        {/* Custom Selfie Modal */}
        <SelfieManager
          visible={showSelfieCapture}
          onCapture={handleCustomSelfieCapture}
          onCancel={handleCustomSelfieCancel}
          enableFlash={enableFlash}
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
});
