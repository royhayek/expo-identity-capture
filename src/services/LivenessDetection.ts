/**
 * Liveness Detection Service
 *
 * Detects if a captured image is from a real physical document/face
 * or a digital copy (screen capture from phone/computer).
 *
 * Detection Methods:
 * 1. Moiré Pattern Detection - Screens produce interference patterns from pixel grids
 * 2. Color Uniformity Analysis - Screens have unnatural color uniformity
 * 3. High-Frequency Pattern Detection - Screen pixels create regular patterns
 * 4. Brightness Distribution - Screens have characteristic backlight uniformity
 *
 * @module LivenessDetection
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Result of a single detection method */
export interface DetectionMethodResult {
  /** Detection method name */
  method: string;
  /** Score from 0 (definitely screen) to 1 (definitely real) */
  score: number;
  /** Confidence in this particular detection (0-1) */
  confidence: number;
  /** Human-readable explanation */
  details: string;
}

/** Complete liveness detection result */
export interface LivenessDetectionResult {
  /** Whether the image is likely from a real document/face */
  isLive: boolean;
  /** Overall liveness score (0-1) */
  overallScore: number;
  /** Confidence in the overall result (0-1) */
  confidence: number;
  /** Results from individual detection methods */
  methodResults: DetectionMethodResult[];
  /** Human-readable summary */
  summary: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/** Configuration for liveness detection */
export interface LivenessDetectionConfig {
  /** Enable moiré pattern detection */
  enableMoireDetection: boolean;
  /** Enable color uniformity analysis */
  enableColorUniformityDetection: boolean;
  /** Enable high-frequency pattern detection */
  enableHighFrequencyDetection: boolean;
  /** Enable brightness distribution analysis */
  enableBrightnessAnalysis: boolean;
  /** Minimum overall score to pass liveness (0-1) */
  livenessThreshold: number;
  /** Weights for each detection method */
  weights: {
    moire: number;
    colorUniformity: number;
    highFrequency: number;
    brightness: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Default configuration */
const DEFAULT_CONFIG: LivenessDetectionConfig = {
  enableMoireDetection: true,
  enableColorUniformityDetection: true,
  enableHighFrequencyDetection: true,
  enableBrightnessAnalysis: true,
  livenessThreshold: 0.50,
  weights: {
    moire: 0.30,
    colorUniformity: 0.25,
    highFrequency: 0.25,
    brightness: 0.20,
  },
};

// Debug logging
const DEBUG_LOGGING = __DEV__ ?? false;

// ============================================================================
// Detection Algorithms (Work with raw pixel data)
// ============================================================================

/**
 * Analyzes moiré patterns in the image
 * Screens produce periodic interference patterns due to pixel grid
 *
 * Method: Calculate local variance in small blocks - screens have
 * characteristic periodic variance patterns
 */
function detectMoirePattern(
  imageBuffer: Uint8Array,
  width: number,
  height: number
): DetectionMethodResult {
  'worklet';

  try {
    const blockSize = 8;
    const variances: number[] = [];

    // Sample blocks across the image
    for (let y = 0; y < height - blockSize; y += blockSize * 2) {
      for (let x = 0; x < width - blockSize; x += blockSize * 2) {
        let sum = 0;
        let sumSq = 0;
        let count = 0;

        // Calculate variance within block (grayscale approximation)
        for (let by = 0; by < blockSize; by++) {
          for (let bx = 0; bx < blockSize; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 3;
            // Convert to grayscale using luminance formula
            const gray = imageBuffer[idx] * 0.299 +
                        imageBuffer[idx + 1] * 0.587 +
                        imageBuffer[idx + 2] * 0.114;
            sum += gray;
            sumSq += gray * gray;
            count++;
          }
        }

        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        variances.push(variance);
      }
    }

    if (variances.length < 10) {
      return {
        method: 'Moiré Pattern Detection',
        score: 0.5,
        confidence: 0.3,
        details: 'Insufficient data for analysis',
      };
    }

    // Calculate variance of variances - screens have more regular patterns
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    let varianceOfVariance = 0;
    for (const v of variances) {
      varianceOfVariance += (v - avgVariance) * (v - avgVariance);
    }
    varianceOfVariance /= variances.length;

    // Coefficient of variation of variance
    const cv = Math.sqrt(varianceOfVariance) / (avgVariance + 1);

    // Screens typically have CV between 0.3 and 1.2 for variance patterns
    // Real documents have higher CV due to natural texture variation
    let score: number;
    let details: string;

    if (cv < 0.4) {
      // Very uniform variance - likely screen
      score = 0.25;
      details = `Uniform texture pattern detected (CV: ${cv.toFixed(2)}) - likely screen`;
    } else if (cv < 0.8) {
      // Moderate variance - suspicious
      score = 0.45;
      details = `Moderate texture variation (CV: ${cv.toFixed(2)})`;
    } else if (cv < 1.5) {
      // Good variation - likely real
      score = 0.75;
      details = `Natural texture variation (CV: ${cv.toFixed(2)})`;
    } else {
      // High variation - very likely real
      score = 0.9;
      details = `High texture variation (CV: ${cv.toFixed(2)}) - likely real`;
    }

    return {
      method: 'Moiré Pattern Detection',
      score,
      confidence: 0.75,
      details,
    };
  } catch (error) {
    return {
      method: 'Moiré Pattern Detection',
      score: 0.5,
      confidence: 0.2,
      details: 'Detection failed',
    };
  }
}

/**
 * Analyzes color uniformity across the image
 * Screens display colors with limited depth and unnatural uniformity
 */
function detectColorUniformity(
  imageBuffer: Uint8Array,
  _width: number,
  _height: number
): DetectionMethodResult {
  'worklet';

  try {
    // Build color histogram (simplified - 16 bins per channel)
    const histR = new Array(16).fill(0);
    const histG = new Array(16).fill(0);
    const histB = new Array(16).fill(0);

    const sampleStep = 4; // Sample every 4th pixel for speed
    let sampleCount = 0;

    for (let i = 0; i < imageBuffer.length; i += 3 * sampleStep) {
      const r = Math.floor(imageBuffer[i] / 16);
      const g = Math.floor(imageBuffer[i + 1] / 16);
      const b = Math.floor(imageBuffer[i + 2] / 16);

      histR[r]++;
      histG[g]++;
      histB[b]++;
      sampleCount++;
    }

    // Calculate histogram "spikiness" - screens have more discrete color levels
    let spikes = 0;

    for (let i = 1; i < 15; i++) {
      const diffR = Math.abs(histR[i] - (histR[i-1] + histR[i+1]) / 2);
      const diffG = Math.abs(histG[i] - (histG[i-1] + histG[i+1]) / 2);
      const diffB = Math.abs(histB[i] - (histB[i-1] + histB[i+1]) / 2);

      // Count significant spikes
      if (diffR > sampleCount * 0.02) spikes++;
      if (diffG > sampleCount * 0.02) spikes++;
      if (diffB > sampleCount * 0.02) spikes++;
    }

    const spikinessRatio = spikes / 42; // max 42 spikes (14 bins * 3 channels)

    let score: number;
    let details: string;

    if (spikinessRatio > 0.3) {
      // Many spikes - screen-like color banding
      score = 0.3;
      details = `High color banding (${(spikinessRatio * 100).toFixed(0)}% spiky) - likely screen`;
    } else if (spikinessRatio > 0.15) {
      // Moderate spikes
      score = 0.5;
      details = `Moderate color variation (${(spikinessRatio * 100).toFixed(0)}% spiky)`;
    } else {
      // Smooth histogram - natural colors
      score = 0.8;
      details = `Smooth color distribution - likely real`;
    }

    return {
      method: 'Color Uniformity Analysis',
      score,
      confidence: 0.7,
      details,
    };
  } catch (error) {
    return {
      method: 'Color Uniformity Analysis',
      score: 0.5,
      confidence: 0.2,
      details: 'Detection failed',
    };
  }
}

/**
 * Detects high-frequency periodic patterns
 * Screen pixels create regular grid patterns visible in photos
 */
function detectHighFrequencyPatterns(
  imageBuffer: Uint8Array,
  width: number,
  height: number
): DetectionMethodResult {
  'worklet';

  try {
    // Calculate horizontal and vertical gradients
    let horizontalGradients: number[] = [];
    let verticalGradients: number[] = [];

    const step = 2;

    // Sample horizontal gradients
    for (let y = 10; y < height - 10; y += step * 3) {
      for (let x = 1; x < width - 1; x += step) {
        const prevIdx = (y * width + x - 1) * 3;
        const nextIdx = (y * width + x + 1) * 3;

        // Grayscale gradient
        const prev = (imageBuffer[prevIdx] + imageBuffer[prevIdx + 1] + imageBuffer[prevIdx + 2]) / 3;
        const next = (imageBuffer[nextIdx] + imageBuffer[nextIdx + 1] + imageBuffer[nextIdx + 2]) / 3;

        horizontalGradients.push(Math.abs(next - prev));
      }
    }

    // Sample vertical gradients
    for (let y = 1; y < height - 1; y += step) {
      for (let x = 10; x < width - 10; x += step * 3) {
        const prevIdx = ((y - 1) * width + x) * 3;
        const nextIdx = ((y + 1) * width + x) * 3;

        const prev = (imageBuffer[prevIdx] + imageBuffer[prevIdx + 1] + imageBuffer[prevIdx + 2]) / 3;
        const next = (imageBuffer[nextIdx] + imageBuffer[nextIdx + 1] + imageBuffer[nextIdx + 2]) / 3;

        verticalGradients.push(Math.abs(next - prev));
      }
    }

    if (horizontalGradients.length < 100 || verticalGradients.length < 100) {
      return {
        method: 'High-Frequency Pattern Detection',
        score: 0.5,
        confidence: 0.3,
        details: 'Insufficient data',
      };
    }

    // Calculate average gradient magnitude
    const avgHGrad = horizontalGradients.reduce((a, b) => a + b, 0) / horizontalGradients.length;
    const avgVGrad = verticalGradients.reduce((a, b) => a + b, 0) / verticalGradients.length;

    // Calculate gradient variance
    let hVariance = 0;
    let vVariance = 0;

    for (const g of horizontalGradients) {
      hVariance += (g - avgHGrad) * (g - avgHGrad);
    }
    hVariance /= horizontalGradients.length;

    for (const g of verticalGradients) {
      vVariance += (g - avgVGrad) * (g - avgVGrad);
    }
    vVariance /= verticalGradients.length;

    // Screens have more uniform gradients (lower variance relative to mean)
    const hCV = Math.sqrt(hVariance) / (avgHGrad + 1);
    const vCV = Math.sqrt(vVariance) / (avgVGrad + 1);
    const avgCV = (hCV + vCV) / 2;

    let score: number;
    let details: string;

    if (avgCV < 0.6) {
      // Very uniform gradients - likely screen
      score = 0.25;
      details = `Uniform edge patterns (CV: ${avgCV.toFixed(2)}) - likely screen`;
    } else if (avgCV < 1.0) {
      // Moderate variation
      score = 0.5;
      details = `Moderate edge variation (CV: ${avgCV.toFixed(2)})`;
    } else if (avgCV < 1.5) {
      // Good variation
      score = 0.75;
      details = `Natural edge variation (CV: ${avgCV.toFixed(2)})`;
    } else {
      // High variation - definitely real
      score = 0.9;
      details = `High edge variation (CV: ${avgCV.toFixed(2)}) - likely real`;
    }

    return {
      method: 'High-Frequency Pattern Detection',
      score,
      confidence: 0.7,
      details,
    };
  } catch (error) {
    return {
      method: 'High-Frequency Pattern Detection',
      score: 0.5,
      confidence: 0.2,
      details: 'Detection failed',
    };
  }
}

/**
 * Analyzes brightness distribution
 * Screens have characteristic uniform backlight distribution
 */
function detectBrightnessDistribution(
  imageBuffer: Uint8Array,
  width: number,
  height: number
): DetectionMethodResult {
  'worklet';

  try {
    // Divide image into grid and analyze brightness per region
    const gridSize = 4;
    const regionBrightness: number[] = [];

    const regionWidth = Math.floor(width / gridSize);
    const regionHeight = Math.floor(height / gridSize);

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let sum = 0;
        let count = 0;

        const startX = gx * regionWidth;
        const startY = gy * regionHeight;
        const endX = Math.min(startX + regionWidth, width);
        const endY = Math.min(startY + regionHeight, height);

        // Sample every 4th pixel in the region
        for (let y = startY; y < endY; y += 4) {
          for (let x = startX; x < endX; x += 4) {
            const idx = (y * width + x) * 3;
            const brightness = (imageBuffer[idx] + imageBuffer[idx + 1] + imageBuffer[idx + 2]) / 3;
            sum += brightness;
            count++;
          }
        }

        if (count > 0) {
          regionBrightness.push(sum / count);
        }
      }
    }

    if (regionBrightness.length < 4) {
      return {
        method: 'Brightness Distribution',
        score: 0.5,
        confidence: 0.3,
        details: 'Insufficient data',
      };
    }

    // Calculate variance of regional brightness
    const avgBrightness = regionBrightness.reduce((a, b) => a + b, 0) / regionBrightness.length;
    let variance = 0;
    for (const b of regionBrightness) {
      variance += (b - avgBrightness) * (b - avgBrightness);
    }
    variance /= regionBrightness.length;

    const stdDev = Math.sqrt(variance);
    const cv = stdDev / (avgBrightness + 1);

    // Screens have very uniform brightness (CV < 0.1)
    // Real documents have natural lighting variation
    let score: number;
    let details: string;

    if (cv < 0.05) {
      // Extremely uniform - very likely screen
      score = 0.15;
      details = `Very uniform brightness (CV: ${cv.toFixed(3)}) - likely screen backlight`;
    } else if (cv < 0.12) {
      // Uniform - suspicious
      score = 0.35;
      details = `Uniform brightness (CV: ${cv.toFixed(3)}) - possible screen`;
    } else if (cv < 0.25) {
      // Moderate variation
      score = 0.6;
      details = `Moderate brightness variation (CV: ${cv.toFixed(3)})`;
    } else {
      // Natural lighting variation
      score = 0.85;
      details = `Natural lighting variation (CV: ${cv.toFixed(3)}) - likely real`;
    }

    return {
      method: 'Brightness Distribution',
      score,
      confidence: 0.75,
      details,
    };
  } catch (error) {
    return {
      method: 'Brightness Distribution',
      score: 0.5,
      confidence: 0.2,
      details: 'Detection failed',
    };
  }
}

// ============================================================================
// Main Detection Class
// ============================================================================

/**
 * Performs liveness detection on an image buffer.
 *
 * A plain worklet so a frame processor can call it directly (a class instance can't be captured by a worklet).
 *
 * @param imageBuffer - RGB image data as Uint8Array (3 bytes per pixel)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param config - Detection configuration
 * @returns LivenessDetectionResult with scores and analysis
 */
export function scoreLiveness(
  imageBuffer: Uint8Array,
  width: number,
  height: number,
  config: LivenessDetectionConfig = DEFAULT_CONFIG
): LivenessDetectionResult {
  'worklet';

  const startTime = Date.now();
  const methodResults: DetectionMethodResult[] = [];

  // Validate input
  const expectedSize = width * height * 3;
  if (imageBuffer.length !== expectedSize) {
    if (DEBUG_LOGGING) {
      console.log(`[Liveness] Invalid buffer size: expected ${expectedSize}, got ${imageBuffer.length}`);
    }
    // Nothing could be checked: never a pass (a pass on unreadable data is a bypass)
    return {
      isLive: false,
      overallScore: 0,
      confidence: 0,
      methodResults: [],
      summary: 'Invalid image data - not checked',
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Run enabled detection methods
  if (config.enableMoireDetection) {
    methodResults.push(detectMoirePattern(imageBuffer, width, height));
  }

  if (config.enableColorUniformityDetection) {
    methodResults.push(detectColorUniformity(imageBuffer, width, height));
  }

  if (config.enableHighFrequencyDetection) {
    methodResults.push(detectHighFrequencyPatterns(imageBuffer, width, height));
  }

  if (config.enableBrightnessAnalysis) {
    methodResults.push(detectBrightnessDistribution(imageBuffer, width, height));
  }

  // Calculate weighted overall score
  let totalWeight = 0;
  let weightedScore = 0;
  let weightedConfidence = 0;

  const weights = config.weights;

  methodResults.forEach((result) => {
    let weight = 0;
    switch (result.method) {
      case 'Moiré Pattern Detection':
        weight = weights.moire;
        break;
      case 'Color Uniformity Analysis':
        weight = weights.colorUniformity;
        break;
      case 'High-Frequency Pattern Detection':
        weight = weights.highFrequency;
        break;
      case 'Brightness Distribution':
        weight = weights.brightness;
        break;
    }

    totalWeight += weight;
    weightedScore += result.score * weight * result.confidence;
    weightedConfidence += result.confidence * weight;
  });

  // Normalize: each score weighs by its method's weight and its own confidence, so the sum is divided by both (dividing
  // by the weights alone caps a perfect image at the average confidence, ~0.6, under the 0.5 threshold's margin)
  const overallScore = weightedConfidence > 0 ? weightedScore / weightedConfidence : 0;
  const confidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0.5;
  const isLive = overallScore >= config.livenessThreshold;

  // Generate summary
  let summary: string;
  if (overallScore >= 0.7) {
    summary = 'High confidence: Image appears to be from a real physical source.';
  } else if (overallScore >= 0.5) {
    summary = 'Moderate confidence: Image likely from a real source.';
  } else if (overallScore >= 0.35) {
    summary = 'Low confidence: Image shows characteristics of a digital screen capture.';
  } else {
    summary = 'Very low confidence: Image strongly indicates a screen/digital copy.';
  }

  const processingTimeMs = Date.now() - startTime;

  if (DEBUG_LOGGING) {
    console.log('[Liveness] Detection complete:', {
      isLive,
      overallScore: overallScore.toFixed(3),
      confidence: confidence.toFixed(3),
      processingTimeMs,
      methods: methodResults.map(m => `${m.method}: ${m.score.toFixed(2)}`),
    });
  }

  return {
    isLive,
    overallScore,
    confidence,
    methodResults,
    summary,
    processingTimeMs,
  };
}

/**
 * Liveness Detection Service
 *
 * Combines multiple detection methods to determine if an image
 * is from a real physical source or a digital screen.
 */
export class LivenessDetection {
  private config: LivenessDetectionConfig;

  constructor(config: Partial<LivenessDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Performs liveness detection on an image buffer
   *
   * @param imageBuffer - RGB image data as Uint8Array (3 bytes per pixel)
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @returns LivenessDetectionResult with scores and analysis
   */
  detectLiveness(
    imageBuffer: Uint8Array,
    width: number,
    height: number
  ): LivenessDetectionResult {
    return scoreLiveness(imageBuffer, width, height, this.config);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LivenessDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LivenessDetectionConfig {
    return { ...this.config };
  }

  /**
   * Static method for quick liveness check without creating instance
   */
  static quickCheck(
    imageBuffer: Uint8Array,
    width: number,
    height: number,
    threshold: number = 0.50
  ): { isLive: boolean; score: number } {
    const detector = new LivenessDetection({ livenessThreshold: threshold });
    const result = detector.detectLiveness(imageBuffer, width, height);
    return {
      isLive: result.isLive,
      score: result.overallScore,
    };
  }
}

export default LivenessDetection;
