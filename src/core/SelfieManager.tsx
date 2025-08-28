import React from 'react';
import { Modal } from 'react-native';
import { ModernSelfieCapture } from '../components/SelfieCapture';
import { ImageProcessor } from '../utils/imageProcessor';

export interface SelfieCaptureResult {
  originalImageUri: string;
  croppedImageUri: string;
}

interface SelfieManagerProps {
  visible: boolean;
  onCapture: (result: SelfieCaptureResult) => void;
  onCancel: () => void;
  enableFlash?: boolean;
}

export const SelfieManager: React.FC<SelfieManagerProps> = ({
  visible,
  onCapture,
  onCancel,
  enableFlash = false,
}) => {
  const handleCapture = async (imageUri: string) => {
    console.log(`🤳 Selfie captured: ${imageUri}`);
    
    try {
      // Create a square crop centered on the image for selfies
      // This creates a profile photo style crop
      const croppedImageUri = await ImageProcessor.cropImage({
        uri: imageUri,
        cropX: 0.15,      // 15% from left
        cropY: 0.15,      // 15% from top
        cropWidth: 0.7,   // 70% width (square aspect)
        cropHeight: 0.7,  // 70% height (square aspect)
        quality: 0.8
      });
      
      console.log(`✅ Generated cropped selfie: ${croppedImageUri}`);
      
      onCapture({
        originalImageUri: imageUri,
        croppedImageUri: croppedImageUri
      });
    } catch (error) {
      console.error('❌ Failed to generate cropped selfie:', error);
      // Fallback: use original image as both original and cropped
      onCapture({
        originalImageUri: imageUri,
        croppedImageUri: imageUri
      });
    }
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