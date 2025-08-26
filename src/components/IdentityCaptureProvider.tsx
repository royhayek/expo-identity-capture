import React, { useState, useEffect } from 'react';
import { DocumentCapture } from './DocumentCapture';
import { SelfieCapture } from './SelfieCapture';
import { DocumentCaptureOptions, SelfieCaptureOptions } from '../types';
import { ConfigProvider } from '../context/ConfigContext';
import { IdentityCaptureConfig } from '../types/config';

interface IdentityCaptureProviderProps {
  children: React.ReactNode;
  config?: IdentityCaptureConfig;
}

export const IdentityCaptureProvider: React.FC<IdentityCaptureProviderProps> = ({ 
  children,
  config
}) => {
  const [documentCaptureState, setDocumentCaptureState] = useState<{
    visible: boolean;
    options?: DocumentCaptureOptions;
  }>({ visible: false });

  const [selfieCaptureState, setSelfieCaptureState] = useState<{
    visible: boolean;
    options?: SelfieCaptureOptions;
  }>({ visible: false });

  useEffect(() => {
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__ = {
        startDocumentCapture: (options: DocumentCaptureOptions) => {
          setDocumentCaptureState({ visible: true, options });
        },
        startSelfieCapture: (options: SelfieCaptureOptions) => {
          setSelfieCaptureState({ visible: true, options });
        },
        cancelCapture: () => {
          setDocumentCaptureState({ visible: false });
          setSelfieCaptureState({ visible: false });
        },
      };
    }

    return () => {
      if (typeof globalThis !== 'undefined') {
        delete (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__;
      }
    };
  }, []);

  const handleCloseDocumentCapture = () => {
    setDocumentCaptureState({ visible: false });
  };

  const handleCloseSelfieCapture = () => {
    setSelfieCaptureState({ visible: false });
  };

  return (
    <ConfigProvider config={config}>
      {children}
      
      {documentCaptureState.visible && documentCaptureState.options && (
        <DocumentCapture
          visible={documentCaptureState.visible}
          options={documentCaptureState.options}
          onClose={handleCloseDocumentCapture}
        />
      )}

      {selfieCaptureState.visible && selfieCaptureState.options && (
        <SelfieCapture
          visible={selfieCaptureState.visible}
          options={selfieCaptureState.options}
          onClose={handleCloseSelfieCapture}
        />
      )}
    </ConfigProvider>
  );
};