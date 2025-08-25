import React, { useState, useEffect } from 'react';
import { Modal, Alert } from 'react-native';
import CustomCameraView from '../components/CustomCameraView';
import { VerifiedDocType } from '../types/extraction';

interface CameraManagerProps {
  visible: boolean;
  docType: VerifiedDocType;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
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
}) => {
  const [isModalVisible, setIsModalVisible] = useState(visible);

  useEffect(() => {
    console.log('CameraManager visibility changed:', visible);
    setIsModalVisible(visible);
  }, [visible]);

  const handleCapture = (imageUri: string) => {
    console.log(`📸 Image captured: ${imageUri}`);
    setIsModalVisible(false);
    onCapture(imageUri);
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
  public async showCamera(docType: VerifiedDocType): Promise<{ imageUri: string; cancelled: boolean }> {
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
  public handleCapture(imageUri: string) {
    if (this.captureResolver) {
      this.captureResolver({ imageUri, cancelled: false });
      this.captureResolver = null;
      this.captureRejecter = null;
    }
  }

  /**
   * Handle camera cancellation
   */
  public handleCancel() {
    if (this.captureResolver) {
      this.captureResolver({ imageUri: null, cancelled: true });
      this.captureResolver = null;
      this.captureRejecter = null;
    }
  }
}

export default GlobalCameraManager;