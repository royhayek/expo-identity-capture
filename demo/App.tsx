import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  Switch,
} from "react-native";
import {
  IdentityCaptureProvider,
  captureAndExtract,
  DocumentCaptureResult,
  SelfieCaptureResult,
  arabicStrings,
  frenchStrings,
  CameraManager,
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
  const [pendingDocType, setPendingDocType] = useState<VerifiedDocType | null>(
    null
  );

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
            images: [result.processedImageUri],
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

  const handleCustomCameraCapture = async (imageUri: string) => {
    console.log("📸 Custom camera captured:", imageUri);
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
              images: [imageUri], // Use the real captured image
              capturedAt: new Date().toISOString(),
              metadata: {
                extractedFields: 0, // Custom capture complete - would need OCR processing for field extraction
                quality: { blurScore: 0, brightness: 0, glareDetected: false },
              },
            } as DocumentCaptureResult,
            timestamp: new Date().toISOString(),
          },
        ]);

        Alert.alert(
          "Success",
          `Document captured with custom camera!\n\nPhoto saved: ${pendingDocType.toUpperCase()}\n\nCustom capture with Cancel + Flash only controls completed successfully.`
        );
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
      console.log("Selfie capture initiated");

      // Use expo-image-picker for selfie capture since it's simpler for selfies
      const { ImagePicker } = require("expo-image-picker");

      // Request permissions
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to take selfies"
        );
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.cancelled && result.assets && result.assets.length > 0) {
        const selfieResult: SelfieCaptureResult = {
          image: result.assets[0].uri,
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

        Alert.alert("Success", "Selfie captured!");
      }
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to capture selfie"
      );
    }
  };

  const clearResults = () => {
    setResults([]);
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
              <Text style={styles.sectionTitle}>
                Results ({results.length})
              </Text>
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
    alignItems: "center",
    marginBottom: 15,
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
});
