/**
 * Liveness Challenge
 *
 * The head-turn challenge of the selfie camera, as a pure state machine fed one face sample at a time:
 * centre the face, turn it in each asked direction until the bars fill, come back to the centre, and the
 * photo is taken. Kept free of React and native code so it can be tested and tuned on its own.
 *
 * @module LivenessChallenge
 */

// ============================================================================
// Types
// ============================================================================

/** A direction the customer is asked to turn their head, as they see it on the mirrored preview */
export type LivenessDirection = 'left' | 'right' | 'up';

export type LivenessPhase =
  /** Waiting for one face, centred in the circle */
  | 'positioning'
  /** Asking the current direction */
  | 'challenge'
  /** Every direction done: back to the centre, eyes open */
  | 'centering'
  /** The photo is being taken and checked */
  | 'capturing'
  /** The face left the circle: the step on screen pauses */
  | 'faceLost'
  /** The passive check saw a photo or a screen */
  | 'notLive'
  /** The photo was handed back */
  | 'done';

/**
 * Why the face doesn't count yet, for the host's copy: `tooClose` and `tooFar` mean the phone's distance, `offCentre`
 * the face outside the circle, `turned` the head not facing the camera after the turns. Null when nothing is wrong
 */
export type LivenessHint = 'tooClose' | 'tooFar' | 'offCentre' | 'turned';

/** One frame's face, normalised: angles in degrees, centre and size relative to the frame */
export interface FaceSample {
  /** Head turned sideways, in degrees, as the preview shows it */
  yaw: number;
  /** Head tilted up or down, in degrees */
  pitch: number;
  /** Face centre, 0-1 across the frame */
  centerX: number;
  centerY: number;
  /** Face width relative to the frame's shorter side */
  size: number;
  /** Both eyes open, when classification ran; null when unknown */
  eyesOpen: boolean | null;
}

export interface LivenessChallengeConfig {
  /** Degrees of yaw, from the customer's own neutral, that fill a left / right step */
  yawThreshold: number;
  /** Degrees of pitch, from the customer's own neutral, that fill the up step */
  pitchThreshold: number;
  /** How long a filled step must be held (ms) */
  holdMs: number;
  /** Once full, the hold carries on while the turn stays above this (0-1), so jitter doesn't reset it */
  holdAbove: number;
  /** How long the face must sit centred before the challenge starts (ms); its neutral pose is measured meanwhile */
  positionMs: number;
  /** How long the face may leave the circle before the step pauses (ms) */
  lostGraceMs: number;
  /**
   * A step this far along (0-1) counts as done when the face is lost while turned: detectors drop a face
   * near profile, which is the customer turning, not leaving
   */
  lostCompletesAt: number;
  /** A step without progress for this long starts over (ms); the steps already done are kept */
  stepTimeoutMs: number;
  /** Yaw within this many degrees of the neutral counts as facing the camera again */
  centredDegrees: number;
  /**
   * Pitch within this many degrees of the neutral counts as straight: looser than yaw, as detectors read pitch far less
   * steadily (Apple Vision wanders ±10° on a still head)
   */
  centredPitchDegrees: number;
  /** How long the face must stay centred and straight before the photo is taken (ms) */
  alignMs: number;
  /**
   * After this long facing the camera again without settling (ms), the straight check takes twice its tolerance: the
   * turns already proved a live face, a customer must never be left stuck on the last step
   */
  centeringTimeoutMs: number;
  /** A misaligned reading shorter than this (ms) doesn't restart `alignMs`: one noisy frame isn't a moved head */
  alignGraceMs: number;
  /** How much each new reading weighs in the smoothed pose that the straight check reads (0-1) */
  smoothing: number;
  /** How far (0-1 of a step) a head turned towards a direction still to come counts as a wrong turn */
  wrongTurnAt: number;
  /** How long a wrong turn must be held to count (ms) */
  wrongTurnMs: number;
  /**
   * Wrong turns that restart the whole challenge in a new order: a recorded or looped video of head turns follows its
   * own order, not the one asked. One is forgiven (a mirrored preview confuses left and right)
   */
  maxWrongTurns: number;
  /** 1 when a positive yaw is the customer's left on the mirrored preview, -1 when it is their right */
  yawSign: 1 | -1;
  /** 1 when a positive pitch is the head tilted up, -1 when it is tilted down */
  pitchSign: 1 | -1;
}

/** The customer's resting pose, measured while they place their face: turns are measured from it */
export interface NeutralPose {
  yaw: number;
  pitch: number;
  /** How many samples the average holds */
  samples: number;
}

export interface LivenessChallengeState {
  phase: LivenessPhase;
  /** The asked directions, in order */
  steps: LivenessDirection[];
  /** The step being asked */
  index: number;
  completed: LivenessDirection[];
  /** How far the current step is (0-1) */
  progress: number;
  /** What `faceLost` goes back to */
  resume: LivenessPhase | null;
  neutral: NeutralPose | null;
  centredSince: number | null;
  heldSince: number | null;
  lostSince: number | null;
  /** When the current step last made progress */
  stepActiveAt: number | null;
  /** Since when the face has been centred and straight, after the last step */
  alignedSince: number | null;
  /** Since when it has been off, while `alignedSince` still holds */
  misalignedSince: number | null;
  /** The pose smoothed over the last readings, while facing the camera again */
  smoothed: Pick<NeutralPose, 'yaw' | 'pitch'> | null;
  /** Since when the head has been turned towards a direction still to come */
  wrongSince: number | null;
  /** Wrong turns made in this challenge */
  wrongTurns: number;
  /** Since when the turns have been done and the face is to come back to the centre */
  centeringSince: number | null;
  /** Why the face doesn't count yet, or null */
  hint: LivenessHint | null;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CHALLENGE_CONFIG: LivenessChallengeConfig = {
  // A natural head turn reaches about 17-25° from rest (measured on a device); 15 fills it without a strain
  yawThreshold: 15,
  pitchThreshold: 15,
  holdMs: 300,
  holdAbove: 0.85,
  positionMs: 600,
  lostGraceMs: 1500,
  lostCompletesAt: 0.8,
  stepTimeoutMs: 15000,
  centredDegrees: 8,
  centredPitchDegrees: 14,
  alignMs: 800,
  centeringTimeoutMs: 3000,
  alignGraceMs: 300,
  smoothing: 0.35,
  wrongTurnAt: 0.8,
  wrongTurnMs: 300,
  maxWrongTurns: 2,
  yawSign: 1,
  pitchSign: 1,
};

/**
 * Where a face has to sit to start (centred, close enough), and the looser bounds while it turns (a turned face moves).
 * A face held close reads 0.9 and more (Apple Vision's box is wider than the face): while turning it is still the
 * customer's face, not one that left the circle, so only the photo caps its size (CAPTURE_MAX_SIZE)
 */
const START_BOUNDS = { x: 0.2, y: 0.25, minSize: 0.2, maxSize: 0.9 };
const TURNING_BOUNDS = { x: 0.35, y: 0.35, minSize: 0.12, maxSize: 1.4 };
/** The largest face the photo is taken with: larger, the circle cuts off its chin or forehead */
const CAPTURE_MAX_SIZE = 1.05;

// ============================================================================
// State machine
// ============================================================================

/** The directions in a fresh order, so a recorded video can't pass */
export function shuffledDirections(directions: LivenessDirection[] = ['left', 'right', 'up']): LivenessDirection[] {
  const result = [...directions];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function startChallenge(steps: LivenessDirection[]): LivenessChallengeState {
  return {
    phase: 'positioning',
    steps,
    index: 0,
    completed: [],
    progress: 0,
    resume: null,
    neutral: null,
    centredSince: null,
    heldSince: null,
    lostSince: null,
    stepActiveAt: null,
    alignedSince: null,
    misalignedSince: null,
    smoothed: null,
    wrongSince: null,
    wrongTurns: 0,
    centeringSince: null,
    hint: null,
  };
}

/** Whether one face sits in the circle: strictly to start, loosely while turning */
export function isFaceInCircle(face: FaceSample | null, turning = false): face is FaceSample {
  const bounds = turning ? TURNING_BOUNDS : START_BOUNDS;
  return (
    face !== null &&
    Math.abs(face.centerX - 0.5) <= bounds.x &&
    Math.abs(face.centerY - 0.5) <= bounds.y &&
    face.size >= bounds.minSize &&
    face.size <= bounds.maxSize
  );
}

/** What keeps a face from counting as in the circle, or null when it does */
export function faceHint(face: FaceSample | null, turning = false): Exclude<LivenessHint, 'turned'> | null {
  const bounds = turning ? TURNING_BOUNDS : START_BOUNDS;
  if (face === null) return null;
  if (face.size > bounds.maxSize) return 'tooClose';
  if (face.size < bounds.minSize) return 'tooFar';
  if (Math.abs(face.centerX - 0.5) > bounds.x || Math.abs(face.centerY - 0.5) > bounds.y) return 'offCentre';
  return null;
}

/** How far a face is turned in a direction from the customer's neutral, 0-1 */
export function directionProgress(
  face: FaceSample,
  direction: LivenessDirection,
  config: LivenessChallengeConfig = DEFAULT_CHALLENGE_CONFIG,
  neutral: Pick<NeutralPose, 'yaw' | 'pitch'> = { yaw: 0, pitch: 0 }
): number {
  const yaw = face.yaw - neutral.yaw;
  const pitch = face.pitch - neutral.pitch;
  const raw =
    direction === 'left'
      ? (config.yawSign * yaw) / config.yawThreshold
      : direction === 'right'
        ? (-config.yawSign * yaw) / config.yawThreshold
        : (config.pitchSign * pitch) / config.pitchThreshold;
  return Math.min(1, Math.max(0, raw));
}

/** The running average of the resting pose */
function withNeutral(neutral: NeutralPose | null, face: FaceSample): NeutralPose {
  const samples = (neutral?.samples ?? 0) + 1;
  return {
    yaw: ((neutral?.yaw ?? 0) * (samples - 1) + face.yaw) / samples,
    pitch: ((neutral?.pitch ?? 0) * (samples - 1) + face.pitch) / samples,
    samples,
  };
}

/** The current step done: on to the next, or to facing the camera when it was the last */
function completeStep(state: LivenessChallengeState, now: number): LivenessChallengeState {
  const completed = [...state.completed, state.steps[state.index]];
  const index = state.index + 1;
  return index >= state.steps.length
    ? {
        ...state,
        completed,
        index: state.steps.length,
        progress: 1,
        heldSince: null,
        alignedSince: null,
        misalignedSince: null,
        smoothed: null,
        phase: 'centering',
        centeringSince: now,
        resume: null,
      }
    : { ...state, completed, index, progress: 0, heldSince: null, stepActiveAt: now, phase: 'challenge', resume: null };
}

/**
 * The challenge after one frame's face (`null`: no face, or more than one).
 * `capturing`, `notLive` and `done` are left to the camera: they don't change with faces.
 */
export function advanceChallenge(
  state: LivenessChallengeState,
  face: FaceSample | null,
  now: number,
  config: LivenessChallengeConfig = DEFAULT_CHALLENGE_CONFIG
): LivenessChallengeState {
  if (state.phase === 'capturing' || state.phase === 'notLive' || state.phase === 'done') {
    return state;
  }

  const turning = state.phase !== 'positioning';
  if (!isFaceInCircle(face, turning)) {
    if (state.phase === 'positioning') {
      // Placing the face again measures the neutral again
      return { ...state, centredSince: null, neutral: null, hint: faceHint(face) };
    }
    // Lost while turned far enough: the detector dropped a near-profile face, the step is done
    if (state.phase === 'challenge' && state.progress >= config.lostCompletesAt) {
      return { ...completeStep(state, now), lostSince: now };
    }
    const lostSince = state.lostSince ?? now;
    const hint = faceHint(face, turning);
    if (state.phase !== 'faceLost' && now - lostSince > config.lostGraceMs) {
      return { ...state, phase: 'faceLost', resume: state.phase, heldSince: null, lostSince, hint };
    }
    return { ...state, lostSince, hint };
  }

  let next: LivenessChallengeState = { ...state, lostSince: null, hint: null };
  if (next.phase === 'faceLost') {
    // Back in the circle: on with the same step, its time counted afresh
    next = { ...next, phase: next.resume ?? 'challenge', resume: null, stepActiveAt: now, alignedSince: null, misalignedSince: null, smoothed: null };
  }

  switch (next.phase) {
    case 'positioning': {
      const centredSince = next.centredSince ?? now;
      const neutral = withNeutral(next.neutral, face);
      if (now - centredSince >= config.positionMs) {
        return { ...next, neutral, phase: 'challenge', centredSince: null, index: 0, progress: 0, stepActiveAt: now };
      }
      return { ...next, neutral, centredSince };
    }
    case 'challenge': {
      const direction = next.steps[next.index];
      const progress = directionProgress(face, direction, config, next.neutral ?? undefined);
      // Turned towards a direction still to come, not the one asked (the one just done is left out: the head is on its
      // way back from it)
      const wrongWay =
        progress < 0.3 &&
        next.steps
          .slice(next.index + 1)
          .some((other) => directionProgress(face, other, config, next.neutral ?? undefined) >= config.wrongTurnAt);
      if (wrongWay) {
        const wrongSince = next.wrongSince ?? now;
        if (now - wrongSince < config.wrongTurnMs) return { ...next, progress, wrongSince };
        const wrongTurns = next.wrongTurns + 1;
        // Again: the whole challenge, in a new order. Once: this step afresh
        if (wrongTurns >= config.maxWrongTurns) return startChallenge(shuffledDirections(next.steps));
        return { ...next, progress: 0, heldSince: null, wrongSince: null, wrongTurns, stepActiveAt: now };
      }
      next = { ...next, wrongSince: null };
      // Turned at all counts as trying: only a step left untouched times out
      const stepActiveAt = progress >= 0.15 ? now : (next.stepActiveAt ?? now);
      // Stuck on this step: it starts over, the steps already done stay done
      if (now - stepActiveAt > config.stepTimeoutMs) {
        return { ...next, progress: 0, heldSince: null, stepActiveAt: now };
      }
      const holding = next.heldSince !== null && progress >= config.holdAbove;
      if (progress < 1 && !holding) {
        return { ...next, progress, heldSince: null, stepActiveAt };
      }
      const heldSince = next.heldSince ?? now;
      if (now - heldSince < config.holdMs) {
        return { ...next, progress, heldSince, stepActiveAt };
      }
      return completeStep(next, now);
    }
    case 'centering': {
      // Back in the circle, straight and still for a moment: only then is the photo taken. Read on the smoothed pose,
      // and a brief slip forgiven, so the detector's noise alone never holds the photo back
      const neutral = next.neutral ?? { yaw: 0, pitch: 0 };
      const weight = next.smoothed ? config.smoothing : 1;
      const smoothed = {
        yaw: (next.smoothed?.yaw ?? 0) * (1 - weight) + (face.yaw - neutral.yaw) * weight,
        pitch: (next.smoothed?.pitch ?? 0) * (1 - weight) + (face.pitch - neutral.pitch) * weight,
      };
      // The circle as the turns had it: the strict start bounds would ask the customer to move back (a face just turned
      // reads larger and off-centre) when it is already in the circle. Only a face the circle would cut is too close.
      // Settling for too long widens the straight check: no customer stays stuck on the last step
      const centeringSince = next.centeringSince ?? now;
      next = { ...next, centeringSince };
      const tolerance = now - centeringSince >= config.centeringTimeoutMs ? 2 : 1;
      const tooClose = face.size > CAPTURE_MAX_SIZE;
      const straight =
        Math.abs(smoothed.yaw) < config.centredDegrees * tolerance &&
        Math.abs(smoothed.pitch) < config.centredPitchDegrees * tolerance &&
        face.eyesOpen !== false;
      if (tooClose || !straight) {
        const hint = tooClose ? 'tooClose' : 'turned';
        const misalignedSince = next.misalignedSince ?? now;
        return now - misalignedSince > config.alignGraceMs
          ? { ...next, smoothed, hint, alignedSince: null, misalignedSince: null }
          : { ...next, smoothed, hint, misalignedSince };
      }
      const alignedSince = next.alignedSince ?? now;
      const settled = { ...next, smoothed, alignedSince, misalignedSince: null };
      return now - alignedSince >= config.alignMs ? { ...settled, phase: 'capturing' } : settled;
    }
    default:
      return next;
  }
}

/** The direction on screen, or null outside the challenge */
export function currentDirection(state: LivenessChallengeState): LivenessDirection | null {
  return state.phase === 'challenge' || (state.phase === 'faceLost' && state.resume === 'challenge')
    ? state.steps[state.index] ?? null
    : null;
}
