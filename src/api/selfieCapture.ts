import { SelfieCaptureResult, SelfieCaptureOptions } from '../types';

export class SelfieCaptureAPI {
  private static activeCapture: Promise<SelfieCaptureResult> | null = null;

  static async captureSelfie(options: Partial<SelfieCaptureOptions> = {}): Promise<SelfieCaptureResult> {
    if (this.activeCapture) {
      throw new Error('Another capture is already in progress');
    }

    return new Promise((resolve, reject) => {
      this.activeCapture = new Promise<SelfieCaptureResult>((resolveCapture, rejectCapture) => {
        const captureOptions: SelfieCaptureOptions = {
          output: 'uri',
          quality: 0.8,
          maxWidth: 1920,
          maxHeight: 1080,
          ...options,
          onSuccess: (result) => {
            this.activeCapture = null;
            options.onSuccess?.(result);
            resolveCapture(result as SelfieCaptureResult);
            resolve(result as SelfieCaptureResult);
          },
          onCancel: () => {
            this.activeCapture = null;
            options.onCancel?.();
            const error = new Error('Selfie capture was cancelled by user');
            rejectCapture(error);
            reject(error);
          },
          onError: (error) => {
            this.activeCapture = null;
            options.onError?.(error);
            rejectCapture(error);
            reject(error);
          },
        };

        this.initiateCaptureFlow(captureOptions);
      });
    });
  }

  private static initiateCaptureFlow(options: SelfieCaptureOptions): void {
    if (typeof globalThis !== 'undefined' && (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__) {
      (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__.startSelfieCapture(options);
    } else {
      throw new Error('Identity capture manager not initialized. Make sure to wrap your app with IdentityCaptureProvider.');
    }
  }

  static isCapturing(): boolean {
    return this.activeCapture !== null;
  }

  static cancelCurrentCapture(): void {
    if (this.activeCapture) {
      this.activeCapture = null;
      if (typeof globalThis !== 'undefined' && (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__) {
        (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__.cancelCapture();
      }
    }
  }
}