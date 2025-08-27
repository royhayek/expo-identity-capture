import React from 'react';
import { Modal } from 'react-native';
import { ModernSelfieCapture } from '../components/SelfieCapture';

interface SelfieManagerProps {
  visible: boolean;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
  enableFlash?: boolean;
}

export const SelfieManager: React.FC<SelfieManagerProps> = ({
  visible,
  onCapture,
  onCancel,
  enableFlash = false,
}) => {
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
        onCapture={onCapture}
        onCancel={onCancel}
        enableFlash={enableFlash}
      />
    </Modal>
  );
};

export default SelfieManager;