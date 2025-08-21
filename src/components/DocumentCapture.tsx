import React, { useState, useCallback } from 'react';
import { Modal } from 'react-native';
import { DocumentType, DocumentCaptureResult, DocumentCaptureOptions, DocumentSide } from '../types';
import { CameraScreen } from './CameraScreen';
import { ImageProcessor } from '../utils/imageProcessor';
import { FlowRules } from '../utils/flowRules';

interface DocumentCaptureProps {
  visible: boolean;
  options: DocumentCaptureOptions;
  onClose: () => void;
}

interface CaptureState {
  capturedImages: Array<{
    uri: string;
    side?: DocumentSide;
  }>;
  currentSide?: DocumentSide;
  requiresBackSide: boolean;
}

export const DocumentCapture: React.FC<DocumentCaptureProps> = ({
  visible,
  options,
  onClose,
}) => {
  const [state, setState] = useState<CaptureState>({
    capturedImages: [],
    currentSide: options.type === 'civil_id' ? 'front' : undefined,
    requiresBackSide: options.type === 'civil_id',
  });

  const handleCapture = useCallback(async (imageUri: string) => {
    try {
      const newImage = {
        uri: imageUri,
        side: state.currentSide,
      };

      const updatedImages = [...state.capturedImages, newImage];

      if (state.requiresBackSide && state.currentSide === 'front') {
        setState(prev => ({
          ...prev,
          capturedImages: updatedImages,
          currentSide: 'back',
        }));
      } else {
        // Capture is complete, process result immediately
        const images = updatedImages.map(img => img.uri);
        const sides = updatedImages
          .map(img => img.side)
          .filter((side): side is DocumentSide => side !== undefined);

        const result: DocumentCaptureResult = {
          type: options.type,
          images,
          sides: sides.length > 0 ? sides : undefined,
          capturedAt: ImageProcessor.getTimestamp(),
        };

        options.onSuccess?.(result);
        onClose();
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('Failed to capture document'));
    }
  }, [state.currentSide, state.requiresBackSide, state.capturedImages, options]);


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
        documentType={options.type}
        documentSide={state.currentSide}
        config={options}
        onCapture={handleCapture}
        onCancel={handleCancel}
        onError={handleError}
      />
    </Modal>
  );
};