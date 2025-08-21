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
  const [flash, setFlash] = useState<FlashMode>("off");
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

  const toggleFlash = () => {
    setFlash(flash === "off" ? "on" : "off");
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
      <StatusBar hidden />

      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>{strings.cancel || "Cancel"}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{getTitle()}</Text>

        <TouchableOpacity onPress={toggleFlash} style={styles.flashButton}>
          <Text style={styles.flashText}>
            {flash === "on" ? strings.flashOn || "Flash On" : strings.flashOff || "Flash Off"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flash}>
          <View style={styles.overlay}>
            <View
              style={[
                styles.frameGuide,
                {
                  width: frameGuide.width,
                  height: frameGuide.height,
                  borderRadius: frameGuide.borderRadius,
                },
              ]}
            />
          </View>
        </CameraView>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.capturingButton]}
          onPress={handleCapture}
          disabled={isCapturing}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  cancelButton: {
    padding: 10,
  },
  cancelText: {
    color: "white",
    fontSize: 16,
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    flex: 1,
  },
  flashButton: {
    padding: 10,
  },
  flashText: {
    color: "white",
    fontSize: 14,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  frameGuide: {
    borderWidth: 3,
    borderColor: "white",
    backgroundColor: "transparent",
  },
  controls: {
    height: 120,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  capturingButton: {
    opacity: 0.7,
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "white",
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
