import { DocumentType, DocumentCaptureResult, DocumentCaptureOptions } from '../types';
export declare class DocumentCaptureAPI {
    private static activeCapture;
    static captureDocument(type: DocumentType, options?: Partial<DocumentCaptureOptions>): Promise<DocumentCaptureResult>;
    private static validateDocumentType;
    private static initiateCaptureFlow;
    static isCapturing(): boolean;
    static cancelCurrentCapture(): void;
}
declare global {
    var __EXPO_IDENTITY_CAPTURE_MANAGER__: {
        startDocumentCapture: (options: DocumentCaptureOptions) => void;
        startSelfieCapture: (options: any) => void;
        cancelCapture: () => void;
    } | undefined;
}