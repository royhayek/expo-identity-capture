import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Alert, StatusBar } from "react-native";
import { CameraView, CameraType, useCameraPermissions, FlashMode } from "expo-camera";
import { DocumentType, DocumentSide, CaptureConfig, LocalizedStrings } from "../types";
import { defaultStrings } from "../utils/defaultStrings";
import { ImageProcessor } from "../utils/imageProcessor";

interface CameraScreenProps {
  documentType?: DocumentType;
  documentSide?: DocumentSide;
  isSelfie?: boolean;
  config: CaptureConfig;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export const CameraScreen: React.FC<CameraScreenProps> = ({
  documentType,
  documentSide,
  isSelfie = false,
  config,
  onCapture,
  onCancel,
  onError,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>(isSelfie ? "front" : "back");
  const [flash] = useState<FlashMode>("off");
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const strings: LocalizedStrings = { ...defaultStrings, ...config.strings };

  const getTitle = (): string => {
    if (isSelfie) return strings.captureSelfie || "Capture Selfie";

    switch (documentType) {
      case "passport":
        return strings.capturePassport || "Capture Passport";
      case "civil_id":
        return documentSide === "front"
          ? strings.captureCivilIdFront || "Capture Civil ID - Front"
          : strings.captureCivilIdBack || "Capture Civil ID - Back";
      case "army_card":
        return strings.captureArmyCard || "Capture Army Card";
      case "residence_permit":
        return strings.captureResidencePermit || "Capture Residence Permit";
      default:
        return strings.captureDocument || "Capture Document";
    }
  };

  const getInstructionText = (): string => {
    if (isSelfie)
      return strings.captureSelfieInstruction || "Please position your face in the circle and look into the camera";
    return strings.captureSelfieInstruction || "Please position the ID in the white space";
  };

  const getFrameGuide = () => {
    if (isSelfie) {
      return {
        width: screenWidth * 0.7,
        height: screenWidth * 0.7,
        borderRadius: screenWidth * 0.35,
        aspectRatio: 1,
      };
    }

    return {
      width: screenWidth * 0.85,
      height: screenWidth * 0.55,
      borderRadius: 12,
      aspectRatio: 1.54,
    };
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1,
        base64: false,
      });

      const processedImage = await ImageProcessor.processImage({
        uri: photo.uri,
        config,
      });

      onCapture(processedImage);
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Failed to capture photo"));
    } finally {
      setIsCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>{strings.loading || "Loading..."}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{strings.cameraPermissionDenied || "Camera permission is required"}</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>{strings.cancel || "Cancel"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const frameGuide = getFrameGuide();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flash}>
          {/* Header with back arrow and title */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.backButton}>
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{getTitle()}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Instruction text */}
          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>{getInstructionText()}</Text>
          </View>

          {/* Overlay with frame guide */}
          <View style={styles.overlay}>
            <View
              style={[
                isSelfie ? styles.faceGuide : styles.documentFrameGuide,
                {
                  width: frameGuide.width,
                  height: frameGuide.height,
                  borderRadius: frameGuide.borderRadius,
                },
              ]}
            />
          </View>

          {/* Bottom controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.captureButton, isCapturing && styles.capturingButton]}
              onPress={handleCapture}
              disabled={isCapturing}
            >
              <View style={[styles.captureButtonInner, isSelfie && styles.selfieButtonInner]} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  instructionContainer: {
    position: "absolute",
    top: 140,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "400",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  documentFrameGuide: {
    borderWidth: 4,
    borderColor: "#00FF00",
    backgroundColor: "transparent",
    borderStyle: "solid",
  },
  faceGuide: {
    borderWidth: 3,
    borderColor: "white",
    backgroundColor: "transparent",
    borderStyle: "solid",
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "white",
  },
  capturingButton: {
    opacity: 0.7,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "white",
  },
  selfieButtonInner: {
    backgroundColor: "#00E5C7",
  },
  errorText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
});
