/**
 * Google Cloud Vision OCR Service
 *
 * Provides text recognition using Google Cloud Vision API.
 * Supports Arabic, French, English and other languages.
 *
 * @module CloudVisionOCR
 */

import { File } from 'expo-file-system';

// ============================================================================
// Types
// ============================================================================

export interface CloudVisionConfig {
  /** Google Cloud Vision API key */
  apiKey: string;
  /** Language hints for better recognition (optional) */
  languageHints?: string[];
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface TextAnnotation {
  /** Detected text content */
  text: string;
  /** Bounding polygon vertices */
  boundingPoly?: {
    vertices: Array<{ x: number; y: number }>;
  };
  /** Language code */
  locale?: string;
}

export interface CloudVisionResponse {
  /** Full text detected in the image */
  text: string;
  /** Individual text annotations */
  annotations: TextAnnotation[];
  /** Detected language codes */
  detectedLanguages: string[];
  /** Raw API response for debugging */
  raw?: any;
}

export interface CloudVisionError {
  code: 'API_KEY_MISSING' | 'NETWORK_ERROR' | 'API_ERROR' | 'INVALID_IMAGE' | 'TIMEOUT';
  message: string;
  details?: string;
}

// ============================================================================
// Configuration
// ============================================================================

let globalConfig: CloudVisionConfig | null = null;

/**
 * Initialize the Cloud Vision service with API key
 * Call this once at app startup
 */
export function initCloudVision(config: CloudVisionConfig): void {
  globalConfig = {
    ...config,
    timeout: config.timeout ?? 10000,
  };
  console.log('[CloudVision] Initialized with API key');
}

/**
 * Get the current configuration
 */
export function getCloudVisionConfig(): CloudVisionConfig | null {
  return globalConfig;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Recognize text in an image using Google Cloud Vision API
 *
 * @param imagePath - Local file path to the image (with or without file:// prefix)
 * @param languageHints - Optional array of language codes to prioritize (e.g., ['ar', 'en', 'fr'])
 * @returns Promise with recognized text and annotations
 */
export async function recognizeText(
  imagePath: string,
  languageHints?: string[]
): Promise<CloudVisionResponse> {
  if (!globalConfig?.apiKey) {
    throw createError('API_KEY_MISSING', 'Cloud Vision API key not configured. Call initCloudVision() first.');
  }

  // Ensure path has file:// prefix for expo-file-system
  const filePath = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

  try {
    // Read image and convert to base64
    console.log('[CloudVision] Reading image from:', filePath);
    const imageBase64 = await new File(filePath).base64();
    console.log('[CloudVision] Image size:', Math.round(imageBase64.length / 1024), 'KB');

    // Build request payload
    const requestBody = buildRequestBody(imageBase64, languageHints);

    // Make API request
    const response = await fetchWithTimeout(
      `https://vision.googleapis.com/v1/images:annotate?key=${globalConfig.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      globalConfig.timeout!
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw createError(
        'API_ERROR',
        `Cloud Vision API error: ${response.status}`,
        JSON.stringify(errorData)
      );
    }

    const data = await response.json();
    return parseResponse(data);

  } catch (error) {
    if (isCloudVisionError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('timeout') || message.includes('TIMEOUT')) {
      throw createError('TIMEOUT', 'Cloud Vision request timed out', message);
    }

    if (message.includes('network') || message.includes('Network')) {
      throw createError('NETWORK_ERROR', 'Network error during OCR request', message);
    }

    throw createError('API_ERROR', 'Failed to recognize text', message);
  }
}

/**
 * Simple text recognition - returns just the text string
 * Convenience wrapper around recognizeText
 */
export async function recognizeTextSimple(
  imagePath: string,
  languageHints?: string[]
): Promise<string> {
  const result = await recognizeText(imagePath, languageHints);
  return result.text;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildRequestBody(imageBase64: string, languageHints?: string[]) {
  const imageContext: any = {};

  // Add language hints if provided
  const hints = languageHints ?? globalConfig?.languageHints;
  if (hints && hints.length > 0) {
    imageContext.languageHints = hints;
  }

  return {
    requests: [
      {
        image: {
          content: imageBase64,
        },
        features: [
          {
            type: 'TEXT_DETECTION',
            maxResults: 50,
          },
        ],
        ...(Object.keys(imageContext).length > 0 && { imageContext }),
      },
    ],
  };
}

function parseResponse(data: any): CloudVisionResponse {
  const responses = data.responses?.[0] ?? {};
  const textAnnotations = responses.textAnnotations ?? [];
  const fullTextAnnotation = responses.fullTextAnnotation;

  // First annotation is the full text, rest are individual words/blocks
  const fullText = textAnnotations[0]?.description ?? fullTextAnnotation?.text ?? '';

  // Extract detected languages
  const detectedLanguages: string[] = [];
  if (fullTextAnnotation?.pages) {
    for (const page of fullTextAnnotation.pages) {
      if (page.property?.detectedLanguages) {
        for (const lang of page.property.detectedLanguages) {
          if (lang.languageCode && !detectedLanguages.includes(lang.languageCode)) {
            detectedLanguages.push(lang.languageCode);
          }
        }
      }
    }
  }

  // Also check first annotation for locale
  if (textAnnotations[0]?.locale && !detectedLanguages.includes(textAnnotations[0].locale)) {
    detectedLanguages.unshift(textAnnotations[0].locale);
  }

  console.log('[CloudVision] Detected languages:', detectedLanguages);
  console.log('[CloudVision] Text length:', fullText.length, 'characters');

  return {
    text: fullText,
    annotations: textAnnotations.map((annotation: any) => ({
      text: annotation.description,
      boundingPoly: annotation.boundingPoly,
      locale: annotation.locale,
    })),
    detectedLanguages,
    raw: data,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function createError(
  code: CloudVisionError['code'],
  message: string,
  details?: string
): CloudVisionError {
  return { code, message, details };
}

function isCloudVisionError(error: unknown): error is CloudVisionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  init: initCloudVision,
  recognizeText,
  recognizeTextSimple,
  getConfig: getCloudVisionConfig,
};
