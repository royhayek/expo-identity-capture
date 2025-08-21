import React, { useCallback } from 'react';
import { Modal } from 'react-native';
import { SelfieCaptureResult, SelfieCaptureOptions } from '../types';
import { CameraScreen } from './CameraScreen';
import { ImageProcessor } from '../utils/imageProcessor';

interface SelfieCaptureProps {
  visible: boolean;
  options: SelfieCaptureOptions;
  onClose: () => void;
}


export const SelfieCapture: React.FC<SelfieCaptureProps> = ({
  visible,
  options,
  onClose,
}) => {

  const handleCapture = useCallback(async (imageUri: string) => {
    try {
      const result: SelfieCaptureResult = {
        image: imageUri,
        capturedAt: ImageProcessor.getTimestamp(),
      };

      options.onSuccess?.(result);
      onClose();
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('Failed to process selfie'));
    }
  }, [options, onClose]);


  const handleCancel = useCallback(() => {
    options.onCancel?.();
    onClose();
  }, [options, onClose]);

  const handleError = useCallback((error: Error) => {
    options.onError?.(error);
  }, [options]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <CameraScreen
        isSelfie={true}
        config={options}
        onCapture={handleCapture}
        onCancel={handleCancel}
        onError={handleError}
      />
    </Modal>
  );
};