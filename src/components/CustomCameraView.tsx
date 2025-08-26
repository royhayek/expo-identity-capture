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
import { areCornersStable } from '../utils/DocumentDetectionProcessor';
import TextRecognition from '@react-native-ml-kit/text-recognition';

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
  // Removed stableFrameCount state - now using confidence-based detection
  
  // Camera setup
  const device = useCameraDevice('back');
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
    consecutiveFailures: 0
  });
  
  // Update detection state function
  const updateDetection = useCallback((detection: any) => {
    setIsDocumentDetected(detection.isDetected);
    setDetectedCorners(detection.corners);
    setDetectionConfidence(detection.confidence);
  }, []);
  
  const runUpdateDetection = useRunOnJS(updateDetection, [updateDetection]);
  
  // Document text validation function (declared first so it can be used by other functions)
  const validateDocumentText = useCallback((ocrResult: any, documentType: VerifiedDocType): boolean => {
    try {
      const detectedText = ocrResult?.text?.toLowerCase() || '';
      
      if (!detectedText || detectedText.length < 10) {
        console.log('📝 Insufficient text for validation (need 10+ chars)');
        return false;
      }
      
      // Skip obvious debug/log text
      const debugPatterns = [
        /log\s+/i, /console/i, /debug/i, /error/i, /warning/i,
        /starting\s+/i, /validation/i, /detected\s+text/i,
        /analysis/i, /buffer/i, /dimensions/i, /confidence/i
      ];
      
      let debugMatches = 0;
      debugPatterns.forEach(pattern => {
        if (pattern.test(detectedText)) debugMatches++;
      });
      
      if (debugMatches >= 2) {
        console.log('❌ Text appears to be debug output, not document text');
        return false;
      }
      
      // Document type specific keywords (relaxed for better matching)
      const documentKeywords: Record<VerifiedDocType, string[]> = {
        passport: [
          'passport', 'passeport', 'جواز سفر', 'republic', 'state',
          'nationality', 'birth', 'sex', 'country', 'document',
          'given name', 'surname', 'دولة', 'جمهورية'
        ],
        civil_id: [
          'civil', 'identity', 'card', 'national', 'citizen',
          'بطاقة مدنية', 'هوية', 'republic', 'state', 'الجمهورية',
          'الكويت', 'kuwait', 'مدني', 'رقم مدني'
        ],
        army_card: [
          'military', 'army', 'armed forces', 'service', 'rank',
          'القوات المسلحة', 'عسكرية', 'الجيش', 'رتبة', 'عسكري'
        ],
        residence_permit: [
          'residence', 'permit', 'visa', 'stay', 'إقامة',
          'تصريح إقامة', 'resident', 'immigration', 'work',
          'هجرة', 'مقيم', 'إذن'
        ]
      };
      
      // General document indicators
      const generalIndicators = [
        'republic', 'state', 'government', 'ministry', 'authority',
        'number', 'date', 'name', 'nationality', 'issued', 'valid',
        'الجمهورية', 'دولة', 'حكومة', 'وزارة', 'رسمي', 'رقم',
        'تاريخ', 'اسم', 'جنسية', 'صادر', 'صالح'
      ];
      
      const specificKeywords = documentKeywords[documentType] || [];
      
      // Count matches
      let specificMatches = 0;
      specificKeywords.forEach(keyword => {
        if (detectedText.includes(keyword.toLowerCase())) {
          specificMatches++;
          console.log(`✅ Found keyword: ${keyword}`);
        }
      });
      
      let generalMatches = 0;
      generalIndicators.forEach(indicator => {
        if (detectedText.includes(indicator.toLowerCase())) {
          generalMatches++;
        }
      });
      
      // Relaxed validation criteria for OCR-based detection
      const hasGeneralIndicators = generalMatches >= 1; // At least 1 general indicator
      const hasSpecificKeywords = specificMatches >= 1; // At least 1 specific keyword
      const hasSubstantialText = detectedText.length >= 10; // Reduced to 10 characters minimum
      
      const isValid = hasGeneralIndicators && hasSpecificKeywords && hasSubstantialText;
      
      console.log(`📋 OCR Validation:`, {
        general: `${generalMatches}/1+`,
        specific: `${specificMatches}/1+`, 
        textLength: `${detectedText.length}/10+`,
        result: isValid
      });
      
      return isValid;
      
    } catch (error) {
      console.log('❌ Text validation error:', error);
      return false;
    }
  }, []);
  
  // OCR-based document detection
  const performRealtimeOCRValidation = useCallback(async (documentType: VerifiedDocType, currentStableFrames: number): Promise<void> => {
    if (ocrValidationRef.current.inProgress) {
      console.log('🔄 OCR validation already in progress - skipping');
      return;
    }

    const now = Date.now();
    // Throttle OCR checks - minimum 1.5 seconds between validations for faster response
    if (now - ocrValidationRef.current.lastValidationTime < 1500) {
      console.log('⏱️ OCR validation throttled - using cached result');
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
      console.log('🔒 OCR: Setting inProgress flag');
    }
    ocrValidationRef.current.lastValidationTime = now;

    console.log('🔍 Starting OCR-based document detection...');

    try {
      // Take a photo for OCR analysis
      if (!cameraRef.current) {
        console.log('❌ Camera not available for OCR');
        setIsDocumentDetected(false);
        setDetectionConfidence(0);
        ocrValidationRef.current.lastValidationResult = false;
        return;
      }

      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      
      const imagePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      
      // OCR with timeout
      const ocrPromise = TextRecognition.recognize(imagePath);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OCR_TIMEOUT')), 5000)
      );
      
      const ocrResult = await Promise.race([ocrPromise, timeoutPromise]);
      
      const isValidDocument = validateDocumentText(ocrResult, documentType);
      
      console.log('📖 OCR Detection Result:', {
        isValid: isValidDocument,
        textLength: ocrResult?.text?.length || 0,
        blocks: ocrResult?.blocks?.length || 0,
        sampleText: ocrResult?.text?.substring(0, 50) || 'No text'
      });
      
      // Stable detection: Only change state if we have a clear result
      ocrValidationRef.current.lastValidationResult = isValidDocument;
      
      if (isValidDocument) {
        // Document clearly detected - immediately show detection
        console.log('✅ DOCUMENT DETECTED via OCR - showing green frame');
        setIsDocumentDetected(true);
        setDetectionConfidence(0.9);
        ocrValidationRef.current.consecutiveFailures = 0; // Reset failure counter
      } else {
        // Document not detected - use failure counter for stability
        ocrValidationRef.current.consecutiveFailures++;
        
        if (!isDocumentDetected) {
          // We weren't detecting before, stay not detecting
          console.log('❌ No document detected (maintaining not detected state)');
          setIsDocumentDetected(false);
          setDetectionConfidence(0.3);
        } else {
          // We were detecting before - only switch off after multiple failures
          if (ocrValidationRef.current.consecutiveFailures >= 3) {
            console.log('❌ Document lost after 3 consecutive OCR failures');
            setIsDocumentDetected(false);
            setDetectionConfidence(0.3);
            ocrValidationRef.current.consecutiveFailures = 0;
          } else {
            console.log(`⚠️ OCR failed (${ocrValidationRef.current.consecutiveFailures}/3) - keeping detection active`);
            setDetectionConfidence(0.7 - (ocrValidationRef.current.consecutiveFailures * 0.1));
          }
        }
      }
      
    } catch (error) {
      console.log('⚠️ OCR detection failed:', error instanceof Error ? error.message : 'Unknown');
      ocrValidationRef.current.lastValidationResult = false;
      
      // On OCR error, only change state if we weren't detecting before
      if (!isDocumentDetected) {
        setIsDocumentDetected(false);
        setDetectionConfidence(0.1);
      } else {
        console.log('⚠️ OCR error but document was detected before - keeping detection active');
        setDetectionConfidence(0.6); // Lower confidence but keep detection
      }
      
    } finally {
      ocrValidationRef.current.inProgress = false;
    }
  }, [validateDocumentText]);

  // This function is no longer needed - detection is handled directly by OCR

  // Post-capture OCR validation (more thorough)
  const performOCRValidation = useCallback(async (capturedImagePath: string, documentType: VerifiedDocType) => {
    if (ocrValidationRef.current.inProgress) {
      console.log('⏳ OCR validation already in progress');
      return false;
    }

    const now = Date.now();
    // Throttle OCR - minimum 3 seconds between validations
    if (now - ocrValidationRef.current.lastValidationTime < 3000) {
      console.log('⏱️ OCR validation throttled');
      return false;
    }

    ocrValidationRef.current.inProgress = true;
    ocrValidationRef.current.lastValidationTime = now;

    try {
      console.log('📝 Starting OCR validation for captured image...');
      
      // Use ML Kit OCR with timeout protection
      const ocrPromise = TextRecognition.recognize(capturedImagePath);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OCR_TIMEOUT')), 8000)
      );
      
      const ocrResult = await Promise.race([ocrPromise, timeoutPromise]);
      
      console.log('📖 OCR completed - Text length:', ocrResult?.text?.length || 0);
      console.log('📚 OCR blocks found:', ocrResult?.blocks?.length || 0);
      
      // Validate document text
      const isValidDocument = validateDocumentText(ocrResult, documentType);
      
      console.log('🎯 OCR validation result:', {
        isValidDocument,
        textLength: ocrResult?.text?.length || 0,
        blocksCount: ocrResult?.blocks?.length || 0
      });
      
      return isValidDocument;
      
    } catch (error) {
      console.log('❌ OCR validation failed:', error instanceof Error ? error.message : 'Unknown error');
      
      // Don't crash on OCR failure - just return false
      if (error instanceof Error && error.message === 'OCR_TIMEOUT') {
        console.log('⏰ OCR timed out - continuing without text validation');
      }
      
      return false; // Allow capture even if OCR fails
      
    } finally {
      ocrValidationRef.current.inProgress = false;
    }
  }, [validateDocumentText]);
  
  const runOCRValidation = useRunOnJS(performOCRValidation, [performOCRValidation]);
  const runRealtimeOCRValidation = useRunOnJS(performRealtimeOCRValidation, [performRealtimeOCRValidation]);
  
  // Enhanced capture function with OCR validation after stable detection

  // Simplified OCR-based document detection frame processor
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    try {
      // Frame throttling for performance - check every 5 frames (~0.17 seconds at 30fps)
      frameCountRef.current = frameCountRef.current + 1;
      if (frameCountRef.current % 5 !== 0) return;
      
      const frameWidth = frame.width;
      const frameHeight = frame.height;
      
      console.log('🔍 OCR-based detection check (every 5 frames)');
      
      // Create default corners for frame overlay
      const boxTop = frameHeight * 0.2;
      const boxLeft = frameWidth * 0.1;
      const boxWidth = frameWidth * 0.8;
      const boxHeight = frameHeight * 0.5;
      
      const defaultCorners = {
        topLeft: { x: boxLeft, y: boxTop },
        topRight: { x: boxLeft + boxWidth, y: boxTop },
        bottomLeft: { x: boxLeft, y: boxTop + boxHeight },
        bottomRight: { x: boxLeft + boxWidth, y: boxTop + boxHeight }
      };
      
      // Only reset detection state if OCR is not running and we don't currently detect a document
      // This prevents flickering while allowing proper state updates
      if (!ocrValidationRef.current.inProgress && !isDocumentDetected) {
        console.log('🔷 Frame processor: Setting detection to FALSE (no OCR, no current detection)');
        runUpdateDetection({
          isDetected: false,
          corners: defaultCorners,
          confidence: 0.5,
          aspectRatio: 1.0,
          isValidShape: true,
        });
      } else if (!ocrValidationRef.current.inProgress) {
        console.log('🔶 Frame processor: Keeping current detection state (no OCR running)');
        runUpdateDetection({
          isDetected: isDocumentDetected,
          corners: defaultCorners,
          confidence: detectionConfidence,
          aspectRatio: 1.0,
          isValidShape: true,
        });
      } else {
        console.log('🔸 Frame processor: OCR in progress - not updating detection state');
      }
      
      // Trigger OCR validation to check for document content
      console.log('🔍 Triggering OCR-based document detection...');
      
      // Set inProgress flag BEFORE calling OCR to prevent race condition
      if (!ocrValidationRef.current.inProgress) {
        const now = Date.now();
        if (now - ocrValidationRef.current.lastValidationTime >= 1500) {
          ocrValidationRef.current.inProgress = true;
          console.log('🔒 Frame processor: Setting OCR inProgress flag');
        }
      }
      
      runRealtimeOCRValidation(docType, 1); // Always pass stable frame count as 1
      
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
    
    try {
      console.log('📷 Taking photo for document capture...');
      
      const photo = await cameraRef.current.takePhoto({
        flash: isFlashEnabled ? 'on' : 'off',
      });
      
      const imagePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      console.log('📸 Photo captured successfully:', imagePath);
      
      // Perform OCR validation on the captured image (not on frame processing)
      console.log('🔍 Starting post-capture OCR validation...');
      const ocrValid = await runOCRValidation(imagePath, docType);
      
      if (ocrValid) {
        console.log('✅ OCR validation passed - document confirmed');
        onCapture(imagePath);
      } else {
        console.log('⚠️ OCR validation failed - still allowing capture');
        // Still allow capture even if OCR fails (fallback to visual detection)
        Alert.alert(
          'Document Captured',
          'Photo taken successfully. OCR text validation could not confirm document type, but visual detection was successful.',
          [
            {
              text: 'Retake',
              style: 'cancel'
            },
            {
              text: 'Use This Photo',
              onPress: () => onCapture(imagePath)
            }
          ]
        );
      }
      
    } catch (error) {
      console.error('❌ Capture failed:', error);
      Alert.alert('Capture Failed', 'Could not take photo. Please try again.');
    } finally {
      setCaptureInProgress(false);
    }
  }, [captureInProgress, onCapture, isCameraReady, isFlashEnabled, docType, runOCRValidation]);

  const getDocumentTypeLabel = () => {
    switch (docType) {
      case 'passport': return 'Passport';
      case 'civil_id': return 'Civil ID';
      case 'army_card': return 'Army Card';
      case 'residence_permit': return 'Residence Permit';
      default: return 'Document';
    }
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
        
        <View style={styles.overlayContainer}>
          {detectedCorners && isDocumentDetected ? (
            <View 
              style={[
                styles.detectionOverlay,
                {
                  borderColor: detectionConfidence >= 0.8 ? '#4CAF50' : '#FF9800',
                  backgroundColor: detectionConfidence >= 0.8 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)'
                }
              ]}
            />
          ) : (
            <View style={styles.documentGuide} />
          )}
        </View>
      </View>

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

      <View style={styles.bottomContainer}>
        <Text style={styles.instructionText}>
          {getInstructionText()}
        </Text>
        
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusIndicator,
            { 
              backgroundColor: isDocumentDetected 
                ? (detectionConfidence >= 0.8 ? '#4CAF50' : '#FF9800')
                : '#007AFF' 
            }
          ]} />
          <Text style={styles.statusText}>
            {(() => {
              // DEBUG: Log actual render values
              console.log('🎨 UI RENDER VALUES:', {
                isDocumentDetected,
                detectionConfidence,
                confidenceCheck: detectionConfidence >= 0.8,
                corners: !!detectedCorners
              });
              
              if (isDocumentDetected) {
                if (detectionConfidence >= 0.8) {
                  console.log('🟢 Should show: Document detected - tap capture');
                  return 'Document detected - tap capture';
                } else {
                  console.log('🟡 Should show: Document detected with %');
                  return `Document detected (${Math.round(detectionConfidence * 100)}%)`;
                }
              } else {
                console.log('🔵 Should show: Position document in frame');
                return 'Position document in frame';
              }
            })()}
          </Text>
        </View>
        
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
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
    height: '50%',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  detectionOverlay: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    height: '50%',
    borderWidth: 3,
    borderRadius: 8,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  docTypeLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  captureButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignSelf: 'center',
    minWidth: 200,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  processingText: {
    color: '#FF9800',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },
});

export default CustomCameraView;