import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { VerifiedDocType } from '../types/extraction';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useRunOnJS } from 'react-native-worklets-core';

interface CustomCameraViewProps {
  docType: VerifiedDocType;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
}


export const CustomCameraView: React.FC<CustomCameraViewProps> = ({
  docType,
  onCapture,
  onCancel,
}) => {
  const [isFlashEnabled, setIsFlashEnabled] = useState(false);
  const [captureInProgress, setCaptureInProgress] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isDocumentDetected, setIsDocumentDetected] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<any>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  
  // Camera setup
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const resizePlugin = useResizePlugin();
  
  // Update detection state function
  const updateDetection = useCallback((detection: any) => {
    setIsDocumentDetected(detection.isDetected);
    setDetectedCorners(detection.corners);
    setDetectionConfidence(detection.confidence);
    
    // Simple stability tracking - count consecutive detections
    if (detection.isDetected) {
      setStableFrameCount(prev => Math.min(prev + 1, 10)); // Cap at 10
    } else {
      setStableFrameCount(0);
    }
  }, []);
  
  // Create worklet-safe function for updating detection
  const runUpdateDetection = useRunOnJS(updateDetection, [updateDetection]);

  // Request permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const toggleFlash = useCallback(() => {
    setIsFlashEnabled(!isFlashEnabled);
  }, [isFlashEnabled]);

  // Test frame processor to see if it's working at all
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    try {
      console.log(`🎥 Frame processor working! Frame: ${frame.width}x${frame.height}`);
      
      // Simple test - just check frame dimensions and create basic detection
      const frameWidth = frame.width;
      const frameHeight = frame.height;
      
      // Basic detection without resize plugin - just based on frame properties
      const hasValidDimensions = frameWidth > 100 && frameHeight > 100;
      const frameArea = frameWidth * frameHeight;
      
      // Simple time-based variation to test if detection works
      const now = Date.now();
      const timeVariation = (Math.sin(now / 2000) + 1) / 2; // 0 to 1
      const shouldDetect = hasValidDimensions && timeVariation > 0.7;
      
      console.log(`📊 Detection test: dimensions=${hasValidDimensions}, area=${frameArea}, timeVar=${timeVariation.toFixed(2)}, detect=${shouldDetect}`);
      
      if (shouldDetect) {
        const expectedAspectRatio = docType === 'passport' ? 0.7 : 1.6;
        const confidence = timeVariation;
        
        // Create corners based on frame center
        const centerX = frameWidth / 2;
        const centerY = frameHeight / 2;
        const docWidth = frameWidth * 0.6;
        const docHeight = docWidth / expectedAspectRatio;
        
        const corners = {
          topLeft: { x: centerX - docWidth/2, y: centerY - docHeight/2 },
          topRight: { x: centerX + docWidth/2, y: centerY - docHeight/2 },
          bottomLeft: { x: centerX - docWidth/2, y: centerY + docHeight/2 },
          bottomRight: { x: centerX + docWidth/2, y: centerY + docHeight/2 },
        };
        
        console.log(`✅ Document detected! Confidence: ${confidence.toFixed(2)}`);
        
        runUpdateDetection({
          isDetected: true,
          corners,
          confidence,
          aspectRatio: expectedAspectRatio,
          isValidShape: true,
        });
      } else {
        console.log(`❌ No document detected. Time variation: ${timeVariation.toFixed(2)}`);
        
        runUpdateDetection({
          isDetected: false,
          corners: null,
          confidence: timeVariation * 0.5,
          aspectRatio: 0,
          isValidShape: false,
        });
      }
      
    } catch (error) {
      console.log('❌ Frame processor error:', error);
      runUpdateDetection({
        isDetected: false,
        corners: null,
        confidence: 0,
        aspectRatio: 0,
        isValidShape: false,
      });
    }
  }, [docType]);

  // Real image analysis function that runs in worklet context
  const analyzeFrameForDocument = (buffer: Uint8Array, width: number, height: number, documentType: VerifiedDocType) => {
    'worklet';
    
    try {
      // Calculate brightness and contrast metrics
      let totalBrightness = 0;
      let brightPixels = 0;
      let darkPixels = 0;
      let mediumPixels = 0;
      const centerSize = Math.floor(Math.min(width, height) * 0.8); // Increased analysis area
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      
      let validPixelCount = 0;
      
      // Analyze center region for document presence
      for (let y = centerY - centerSize/2; y < centerY + centerSize/2; y++) {
        for (let x = centerX - centerSize/2; x < centerX + centerSize/2; x++) {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const pixelIndex = (y * width + x) * 3; // RGB format
            const r = buffer[pixelIndex] || 0;
            const g = buffer[pixelIndex + 1] || 0;
            const b = buffer[pixelIndex + 2] || 0;
            
            // Calculate brightness
            const brightness = (r + g + b) / 3;
            totalBrightness += brightness;
            validPixelCount++;
            
            // More lenient thresholds for detection
            if (brightness > 150) brightPixels++;      // Lowered from 180
            else if (brightness < 100) darkPixels++;   // Raised from 80
            else mediumPixels++;
          }
        }
      }
      
      const totalPixels = validPixelCount;
      const avgBrightness = totalBrightness / totalPixels;
      const brightRatio = brightPixels / totalPixels;
      const darkRatio = darkPixels / totalPixels;
      const mediumRatio = mediumPixels / totalPixels;
      
      // Debug logging (will show in console)
      console.log(`Frame Analysis: bright=${(brightRatio*100).toFixed(1)}%, dark=${(darkRatio*100).toFixed(1)}%, medium=${(mediumRatio*100).toFixed(1)}%, avgBright=${avgBrightness.toFixed(1)}`);
      
      // More lenient document detection logic
      // Documents can have various brightness levels and contrast ratios
      const hasVariation = (brightRatio > 0.1 || darkRatio > 0.1) && (brightRatio + darkRatio + mediumRatio > 0.8);
      const hasReasonableBrightness = avgBrightness > 50 && avgBrightness < 250; // Much wider range
      const hasContrast = Math.abs(brightRatio - darkRatio) > 0.05; // Some contrast difference
      
      const isLikelyDocument = hasVariation && hasReasonableBrightness && hasContrast;
      
      console.log(`Detection: variation=${hasVariation}, brightness=${hasReasonableBrightness}, contrast=${hasContrast}, result=${isLikelyDocument}`);
      
      if (isLikelyDocument) {
        const expectedAspectRatio = documentType === 'passport' ? 0.7 : 1.6;
        const confidence = Math.min(0.5 + (brightRatio * 0.3) + (darkRatio * 0.2), 0.95);
        
        // Calculate document bounds based on analysis
        const docWidth = centerSize * 0.9;
        const docHeight = docWidth / expectedAspectRatio;
        
        const corners = {
          topLeft: { x: centerX - docWidth/2, y: centerY - docHeight/2 },
          topRight: { x: centerX + docWidth/2, y: centerY - docHeight/2 },
          bottomLeft: { x: centerX - docWidth/2, y: centerY + docHeight/2 },
          bottomRight: { x: centerX + docWidth/2, y: centerY + docHeight/2 },
        };
        
        return {
          isDetected: true,
          corners,
          confidence,
          aspectRatio: expectedAspectRatio,
          isValidShape: true,
        };
      } else {
        return {
          isDetected: false,
          corners: null,
          confidence: Math.max(brightRatio, darkRatio, mediumRatio) * 0.4,
          aspectRatio: 0,
          isValidShape: false,
        };
      }
      
    } catch (error) {
      console.log('Analysis error:', error);
      return {
        isDetected: false,
        corners: null,
        confidence: 0,
        aspectRatio: 0,
        isValidShape: false,
      };
    }
  };

  // Manual capture only - no auto-capture
  // Users must tap the capture button to take photos

  const handleCapture = useCallback(async () => {
    if (captureInProgress || !cameraRef.current || !isCameraReady) return;
    
    setCaptureInProgress(true);
    
    try {
      console.log('📸 Taking photo...');
      
      const photo = await cameraRef.current.takePhoto({
        flash: isFlashEnabled ? 'on' : 'off',
        enableShutterSound: true,
      });
      
      console.log('✅ Photo captured:', photo.path);
      onCapture(`file://${photo.path}`);
      
    } catch (error) {
      console.error('❌ Capture failed:', error);
      Alert.alert('Capture Error', `Failed to capture image: ${error.message}`);
      setCaptureInProgress(false);
    }
  }, [captureInProgress, onCapture, isCameraReady, isFlashEnabled]);

  const getDocumentTypeLabel = () => {
    const labels = {
      passport: 'Passport',
      civil_id: 'Civil ID',
      army_card: 'Army Card',
      residence_permit: 'Residence Permit',
    };
    return labels[docType] || 'Document';
  };

  const getInstructionText = () => {
    if (docType === 'passport') {
      return 'Open passport to show both pages.\nHold vertically and center in frame.';
    }
    return 'Position document horizontally\nand center in frame.';
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
      
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
          torch={isFlashEnabled ? 'on' : 'off'}
          frameProcessor={frameProcessor}
          onInitialized={() => {
            console.log('✅ Camera initialized');
            setIsCameraReady(true);
          }}
          onError={(error) => {
            console.error('❌ Camera error:', error);
            Alert.alert('Camera Error', `Failed to initialize camera: ${error.message}`);
          }}
        />
        
        {/* Document Detection Overlay */}
        <View style={styles.overlayContainer}>
          {detectedCorners && isDocumentDetected ? (
            <View 
              style={[
                styles.detectionOverlay,
                {
                  borderColor: stableFrameCount >= 5 ? '#4CAF50' : '#FF9800',
                  backgroundColor: stableFrameCount >= 5 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)'
                }
              ]}
            />
          ) : (
            <View style={styles.documentGuide} />
          )}
        </View>
      </View>

      {/* Top Toolbar */}
      <View style={styles.topToolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={onCancel}>
          <Text style={styles.toolbarButtonText}>Cancel</Text>
        </TouchableOpacity>
        
        <Text style={styles.docTypeLabel}>
          {getDocumentTypeLabel()}
        </Text>
        
        <TouchableOpacity style={styles.toolbarButton} onPress={toggleFlash}>
          <Text style={styles.toolbarButtonText}>
            {isFlashEnabled ? '🔦' : '💡'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Instructions */}
      <View style={styles.bottomContainer}>
        <Text style={styles.instructionText}>
          {getInstructionText()}
        </Text>
        
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusIndicator,
            { 
              backgroundColor: isDocumentDetected 
                ? (stableFrameCount >= 5 ? '#4CAF50' : '#FF9800')
                : '#007AFF' 
            }
          ]} />
          <Text style={styles.statusText}>
            {isDocumentDetected 
              ? (stableFrameCount >= 5 
                  ? 'Document ready - tap capture' 
                  : `Document detected (${Math.round(detectionConfidence * 100)}%)`)
              : 'Position document in frame'
            }
          </Text>
        </View>
        
        {/* Manual Capture Button for Testing */}
        <TouchableOpacity 
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={captureInProgress}
        >
          <Text style={styles.captureButtonText}>
            {captureInProgress ? 'Capturing...' : '📸 Capture Now'}
          </Text>
        </TouchableOpacity>
        
        {captureInProgress && (
          <Text style={styles.processingText}>Processing capture...</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  documentGuide: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  detectionOverlay: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    borderWidth: 3,
    borderRadius: 12,
  },
  topToolbar: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  toolbarButton: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    minWidth: 80,
    alignItems: 'center',
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  docTypeLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
  },
  processingText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
  },
  captureButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default CustomCameraView;