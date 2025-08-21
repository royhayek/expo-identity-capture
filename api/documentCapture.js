"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentCaptureAPI = void 0;
class DocumentCaptureAPI {
    static async captureDocument(type, options = {}) {
        if (this.activeCapture) {
            throw new Error('Another capture is already in progress');
        }
        return new Promise((resolve, reject) => {
            this.activeCapture = new Promise((resolveCapture, rejectCapture) => {
                const captureOptions = {
                    type,
                    output: 'uri',
                    quality: 0.8,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    ...options,
                    onSuccess: (result) => {
                        this.activeCapture = null;
                        options.onSuccess?.(result);
                        resolveCapture(result);
                        resolve(result);
                    },
                    onCancel: () => {
                        this.activeCapture = null;
                        options.onCancel?.();
                        const error = new Error('Capture was cancelled by user');
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
                this.validateDocumentType(type);
                this.initiateCaptureFlow(captureOptions);
            });
        });
    }
    static validateDocumentType(type) {
        const validTypes = ['passport', 'civil_id', 'army_card', 'residence_permit'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid document type: ${type}`);
        }
    }
    static initiateCaptureFlow(options) {
        if (typeof globalThis !== 'undefined' && globalThis.__EXPO_IDENTITY_CAPTURE_MANAGER__) {
            globalThis.__EXPO_IDENTITY_CAPTURE_MANAGER__.startDocumentCapture(options);
        }
        else {
            throw new Error('Identity capture manager not initialized. Make sure to wrap your app with IdentityCaptureProvider.');
        }
    }
    static isCapturing() {
        return this.activeCapture !== null;
    }
    static cancelCurrentCapture() {
        if (this.activeCapture) {
            this.activeCapture = null;
            if (typeof globalThis !== 'undefined' && globalThis.__EXPO_IDENTITY_CAPTURE_MANAGER__) {
                globalThis.__EXPO_IDENTITY_CAPTURE_MANAGER__.cancelCapture();
            }
        }
    }
}
exports.DocumentCaptureAPI = DocumentCaptureAPI;
DocumentCaptureAPI.activeCapture = null;