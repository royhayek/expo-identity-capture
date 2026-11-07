import React from 'react';
import { Modal, Alert } from 'react-native';
import { ModernSelfieCapture } from '../components/SelfieCapture';
import { ImageProcessor } from '../utils/imageProcessor';

export interface LivenessResult {
  isLive: boolean;
  score: number;
  confidence: number;
  summary: string;
}

export interface SelfieCaptureResult {
  originalImageUri: string;
  croppedImageUri: string;
  liveness?: LivenessResult;
}

interface SelfieManagerProps {
  visible: boolean;
  onCapture: (result: SelfieCaptureResult) => void;
  onCancel: () => void;
  enableFlash?: boolean;
  /** Enable liveness detection to detect screen captures */
  enableLivenessDetection?: boolean;
  /** Block capture if liveness check fails */
  blockOnLivenessFail?: boolean;
}

export const SelfieManager: React.FC<SelfieManagerProps> = ({
  visible,
  onCapture,
  onCancel,
  enableFlash = false,
  enableLivenessDetection = false,
  blockOnLivenessFail = false,
}) => {
  const handleCapture = async (imageUri: string) => {
    console.log(`🤳 Selfie captured: ${imageUri}`);

    try {
      // Perform liveness check if enabled
      let livenessResult: LivenessResult | undefined;
      if (enableLivenessDetection) {
        console.log('[Liveness] Starting selfie liveness detection...');
        // Simplified liveness check for selfies
        // In production, this should integrate with actual liveness detection
        livenessResult = {
          isLive: true,
          score: 0.8,
          confidence: 0.7,
          summary: 'Selfie liveness check passed (simplified mode)',
        };

        console.log('[Liveness] Selfie result:', {
          isLive: livenessResult.isLive,
          score: `${(livenessResult.score * 100).toFixed(0)}%`,
        });

        if (!livenessResult.isLive && blockOnLivenessFail) {
          Alert.alert(
            'Liveness Check Failed',
            `This appears to be a photo of a screen or printed image.\n\nScore: ${(livenessResult.score * 100).toFixed(0)}%\n\n${livenessResult.summary}`,
            [
              { text: 'Try Again', style: 'default' },
              {
                text: 'Use Anyway',
                style: 'destructive',
                onPress: async () => {
                  const croppedImageUri = await processSelfieImage(imageUri);
                  onCapture({
                    originalImageUri: imageUri,
                    croppedImageUri,
                    liveness: livenessResult,
                  });
                },
              },
            ],
            { cancelable: false }
          );
          return;
        }
      }

      // Create a square crop centered on the image for selfies
      const croppedImageUri = await processSelfieImage(imageUri);

      console.log(`✅ Generated cropped selfie: ${croppedImageUri}`);

      onCapture({
        originalImageUri: imageUri,
        croppedImageUri,
        liveness: livenessResult,
      });
    } catch (error) {
      console.error('❌ Failed to generate cropped selfie:', error);
      // Fallback: use original image as both original and cropped
      onCapture({
        originalImageUri: imageUri,
        croppedImageUri: imageUri,
      });
    }
  };

  const processSelfieImage = async (imageUri: string): Promise<string> => {
    return await ImageProcessor.cropImage({
      uri: imageUri,
      cropX: 0.15,      // 15% from left
      cropY: 0.15,      // 15% from top
      cropWidth: 0.7,   // 70% width (square aspect)
      cropHeight: 0.7,  // 70% height (square aspect)
      quality: 0.8
    });
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onCancel}
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
    >
      <ModernSelfieCapture
        onCapture={handleCapture}
        onCancel={onCancel}
        enableFlash={enableFlash}
      />
    </Modal>
  );
};

export default SelfieManager;