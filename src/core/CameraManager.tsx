import React, { useState, useEffect } from 'react';
import { Modal, Alert } from 'react-native';
import CustomCameraView from '../components/CustomCameraView';
import { VerifiedDocType } from '../types/extraction';
import { ImageProcessor } from '../utils/imageProcessor';
import { DEFAULT_CONFIG } from '../types/config';
import { TemplateLoader } from '../utils/templateLoader';

export interface CaptureResult {
  originalImageUri: string;
  croppedImageUri: string;
}

interface CameraManagerProps {
  visible: boolean;
  docType: VerifiedDocType;
  onCapture: (result: CaptureResult) => void;
  onCancel: () => void;
  disableDetection?: boolean;
  enableFlash?: boolean;
}

/**
 * Camera Manager Component
 * Handles the presentation of the custom camera view in a modal
 */
export const CameraManager: React.FC<CameraManagerProps> = ({
  visible,
  docType,
  onCapture,
  onCancel,
  disableDetection = false,
  enableFlash = true,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(visible);

  useEffect(() => {
    console.log('CameraManager visibility changed:', visible);
    setIsModalVisible(visible);
  }, [visible]);

  const handleCapture = async (imageUri: string) => {
    console.log(`📸 Image captured: ${imageUri}`);
    setIsModalVisible(false);
    
    try {
      // Try to use template-based cropping first
      let croppedImageUri: string;
      
      console.log(`🔍 Looking for template for ${docType}...`);
      const template = await TemplateLoader.loadTemplate(docType);
      
      if (template) {
        console.log(`📋 Using template-based cropping for ${docType}`);
        croppedImageUri = await ImageProcessor.cropDocumentFromTemplate(imageUri, template);
      } else {
        // Fallback to frame config from DEFAULT_CONFIG
        console.log(`⚠️ No template found for ${docType}, using frame config`);
        const frameConfig = DEFAULT_CONFIG.theme.layout.frame[docType];
        
        if (!frameConfig) {
          console.warn(`⚠️ No frame config found for ${docType}, using default crop`);
          croppedImageUri = await ImageProcessor.cropDocumentFromFrame(imageUri, {
            top: '30%',
            left: '10%',
            right: '10%',
            height: '40%'
          });
        } else {
          const cropConfig = {
            top: frameConfig.top || '30%',
            left: frameConfig.left || '10%',
            right: frameConfig.right || '10%',
            height: frameConfig.height || '40%'
          };
          croppedImageUri = await ImageProcessor.cropDocumentFromFrame(imageUri, cropConfig);
        }
      }
      
      console.log(`✅ Generated cropped image: ${croppedImageUri}`);
      
      onCapture({
        originalImageUri: imageUri,
        croppedImageUri: croppedImageUri
      });
    } catch (error) {
      console.error('❌ Failed to generate cropped image:', error);
      // Fallback: use original image as both original and cropped
      onCapture({
        originalImageUri: imageUri,
        croppedImageUri: imageUri
      });
    }
  };

  const handleCancel = () => {
    console.log('❌ Camera cancelled');
    setIsModalVisible(false);
    onCancel();
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isModalVisible}
      onRequestClose={handleCancel}
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
    >
      <CustomCameraView
        docType={docType}
        onCapture={handleCapture}
        onCancel={handleCancel}
        disableDetection={disableDetection}
        enableFlash={enableFlash}
      />
    </Modal>
  );
};

/**
 * Global camera manager instance
 * This allows us to show the camera from non-React contexts
 */
class GlobalCameraManager {
  private static instance: GlobalCameraManager;
  private captureResolver: ((result: any) => void) | null = null;
  private captureRejecter: ((error: any) => void) | null = null;
  
  public static getInstance(): GlobalCameraManager {
    if (!GlobalCameraManager.instance) {
      GlobalCameraManager.instance = new GlobalCameraManager();
    }
    return GlobalCameraManager.instance;
  }

  /**
   * Show camera and wait for result
   * This is handled by the CameraManager React component
   */
  public async showCamera(docType: VerifiedDocType, disableDetection?: boolean, enableFlash?: boolean): Promise<{ result: CaptureResult | null; cancelled: boolean }> {
    return new Promise((resolve, reject) => {
      this.captureResolver = resolve;
      this.captureRejecter = reject;
      
      console.log(`📱 Camera should be displayed for ${docType} capture`);
      console.log('ℹ️ Camera will be shown via CameraManager component');
      
      // The actual camera display is handled by the CameraManager React component
      // This method just sets up the promise resolution
    });
  }

  /**
   * Handle capture result from camera
   */
  public handleCapture(result: CaptureResult) {
    if (this.captureResolver) {
      this.captureResolver({ result, cancelled: false });
      this.captureResolver = null;
      this.captureRejecter = null;
    }
  }

  /**
   * Handle camera cancellation
   */
  public handleCancel() {
    if (this.captureResolver) {
      this.captureResolver({ result: null, cancelled: true });
      this.captureResolver = null;
      this.captureRejecter = null;
    }
  }
}

export default GlobalCameraManager;