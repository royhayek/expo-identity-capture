import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Modal,
} from "react-native";
import Svg, {
  Defs,
  Rect,
  Mask,
  Path,
  Circle,
  LinearGradient,
  Stop,
  Ellipse,
} from "react-native-svg";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  useThemedStyles,
  useProgressColors,
  useButtonDimensions,
} from "../utils/theme";
import { useLocalizedStrings } from "../context/ConfigContext";
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

interface SelfieCaptureProps {
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
  enableFlash?: boolean;
}

export const ModernSelfieCapture: React.FC<SelfieCaptureProps> = ({
  onCapture,
  onCancel,
  enableFlash = false,
}) => {
  const [isFlashEnabled, setIsFlashEnabled] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Configuration hooks
  const theme = useThemedStyles();
  const progressColors = useProgressColors();
  const { getUIText } = useLocalizedStrings();
  
  // Create dynamic styles based on theme
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  
  // Animated value for circular progress
  const progressAnimation = useRef(new Animated.Value(0)).current;

  // Camera setup - use front camera for selfie
  const device = useCameraDevice("front");
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);

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

    // Start progress animation with configured duration
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      toValue: 1,
      duration: theme.animation.progress?.duration || 1500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    try {
      console.log("📷 Taking selfie photo...");

      const photo = await cameraRef.current.takePhoto({
        flash: isFlashEnabled ? "on" : "off",
      });

      const imagePath = photo.path.startsWith("file://")
        ? photo.path
        : `file://${photo.path}`;
      console.log("📸 Selfie captured successfully:", imagePath);

      onCapture(imagePath);
    } catch (error) {
      console.error("❌ Selfie capture failed:", error);
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
    theme.animation.progress?.duration,
    progressAnimation,
  ]);

  const getSelfieInstructionText = React.useCallback(() => {
    return getUIText("selfie_instruction") || "Look into the camera and position your face within the oval frame";
  }, [getUIText]);

  const getOverlayStyle = () => {
    // Oval frame for selfie - centered and sized for face capture
    return {
      top: "25%",
      left: "15%",
      right: "15%",
      height: "50%",
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
        <Text style={styles.permissionText}>No front camera available</Text>
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
          onInitialized={() => {
            console.log("✅ Front camera initialized");
            setIsCameraReady(true);
          }}
          onError={(error) => {
            console.error("❌ Camera error:", error);
          }}
        />

        {/* SVG overlay with oval cutout */}
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

          // Calculate oval dimensions - make it less oval, more circular
          const ellipseRx = frameWidth / 2;
          const ellipseRy = frameWidth / 1.5; // Use width-based calculation for a more circular shape
          const ellipseCx = frameLeft + frameWidth / 2;
          const ellipseCy = frameTop + frameHeight / 2;

          return (
            <>
              {/* SVG Mask for overlay with oval cutout */}
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
                      <Ellipse
                        cx={ellipseCx}
                        cy={ellipseCy}
                        rx={ellipseRx}
                        ry={ellipseRy}
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
                  {/* Oval frame border */}
                  <Ellipse
                    cx={ellipseCx}
                    cy={ellipseCy}
                    rx={ellipseRx}
                    ry={ellipseRy}
                    stroke="#ffffff"
                    strokeWidth={3}
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
            <Text style={styles.headerTitle}>Live Selfie</Text>
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
            {getSelfieInstructionText()}
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
    // Header styles (same as CustomCameraView)
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
  });

// Backward compatibility wrapper for the original SelfieCapture interface
interface OriginalSelfieCaptureProps {
  visible: boolean;
  options: {
    onSuccess?: (result: { image: string; capturedAt: string }) => void;
    onCancel?: () => void;
    onError?: (error: Error) => void;
  };
  onClose: () => void;
}

export const SelfieCapture: React.FC<OriginalSelfieCaptureProps> = ({
  visible,
  options,
  onClose,
}) => {
  const handleCapture = useCallback((imageUri: string) => {
    const result = {
      image: imageUri,
      capturedAt: new Date().toISOString(),
    };
    options.onSuccess?.(result);
    onClose();
  }, [options, onClose]);

  const handleCancel = useCallback(() => {
    options.onCancel?.();
    onClose();
  }, [options, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <ModernSelfieCapture
        onCapture={handleCapture}
        onCancel={handleCancel}
        enableFlash={false}
      />
    </Modal>
  );
};

export default ModernSelfieCapture;