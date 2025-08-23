import { DocumentType, DocumentCaptureResult, DocumentCaptureOptions } from "../types";
import { FlowRules } from "../utils/flowRules";
import { PassportDetector } from "../utils/passportDetector";
import { logger } from "../utils/logger";

export class DocumentCaptureAPI {
  private static activeCapture: Promise<DocumentCaptureResult> | null = null;

  static async captureDocument(
    type: DocumentType,
    options: Partial<DocumentCaptureOptions> = {}
  ): Promise<DocumentCaptureResult> {
    if (this.activeCapture) {
      throw new Error("Another capture is already in progress");
    }

    return new Promise((resolve, reject) => {
      this.activeCapture = new Promise<DocumentCaptureResult>((resolveCapture, rejectCapture) => {
        const captureOptions: DocumentCaptureOptions = {
          type,
          output: "uri",
          quality: 0.8,
          maxWidth: 1920,
          maxHeight: 1080,
          ...options,
          onSuccess: async (result) => {
            this.activeCapture = null;

            console.log("Document captured:", result);
            // If this is a passport, run Lebanese detection
            if (type === "passport" && "images" in result && result.images && result.images.length > 0) {
              try {
                logger.info("Document Capture", "Running Lebanese passport detection...");
                const detectionResult = await PassportDetector.detectLebanesePassport(result.images[0]);

                logger.success(
                  "Document Capture",
                  `Passport detected as: ${detectionResult.isLebanese ? "Lebanese" : "Non-Lebanese"}`
                );
                logger.info("Document Capture", `Keywords found: [${detectionResult.detectedKeywords.join(", ")}]`);
                logger.info("Document Capture", `Confidence: ${detectionResult.confidence}%`);

                // Add detection result to the capture result
                (result as any).passportDetection = detectionResult;
              } catch (error) {
                logger.error(
                  "Document Capture",
                  `Passport detection failed: ${error instanceof Error ? error.message : "Unknown error"}`
                );
                // Continue with normal flow even if detection fails
              }
            }

            options.onSuccess?.(result);
            resolveCapture(result as DocumentCaptureResult);
            resolve(result as DocumentCaptureResult);
          },
          onCancel: () => {
            this.activeCapture = null;
            options.onCancel?.();
            const error = new Error("Capture was cancelled by user");
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

  private static validateDocumentType(type: DocumentType): void {
    const validTypes: DocumentType[] = ["passport", "civil_id", "army_card", "residence_permit"];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }
  }

  private static initiateCaptureFlow(options: DocumentCaptureOptions): void {
    if (typeof globalThis !== "undefined" && (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__) {
      (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__.startDocumentCapture(options);
    } else {
      throw new Error(
        "Identity capture manager not initialized. Make sure to wrap your app with IdentityCaptureProvider."
      );
    }
  }

  static isCapturing(): boolean {
    return this.activeCapture !== null;
  }

  static cancelCurrentCapture(): void {
    if (this.activeCapture) {
      this.activeCapture = null;
      if (typeof globalThis !== "undefined" && (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__) {
        (globalThis as any).__EXPO_IDENTITY_CAPTURE_MANAGER__.cancelCapture();
      }
    }
  }
}

declare global {
  var __EXPO_IDENTITY_CAPTURE_MANAGER__:
    | {
        startDocumentCapture: (options: DocumentCaptureOptions) => void;
        startSelfieCapture: (options: any) => void;
        cancelCapture: () => void;
      }
    | undefined;
}
