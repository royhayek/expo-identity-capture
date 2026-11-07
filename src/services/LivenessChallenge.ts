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

/** One frame's face, normalised: angles in degrees, centre and size relative to the frame */
export interface FaceSample {
  /** ML Kit's yaw (head turned sideways) */
  yaw: number;
  /** ML Kit's pitch (head tilted up, positive) */
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
  /** Degrees of yaw that fill a left / right step */
  yawThreshold: number;
  /** Degrees of pitch that fill the up step */
  pitchThreshold: number;
  /** How long a filled step must be held (ms) */
  holdMs: number;
  /** How long the face must sit centred before the challenge starts (ms) */
  positionMs: number;
  /** How long the face may leave the circle before the step pauses (ms) */
  lostGraceMs: number;
  /** The whole challenge's time limit: past it, it starts again (ms) */
  timeoutMs: number;
  /** Yaw and pitch both under this many degrees count as facing the camera */
  centredDegrees: number;
  /**
   * 1 when ML Kit's positive yaw is the customer's left on the mirrored front camera, -1 when it is their right.
   * Check it on a device: a reversed sign makes "turn left" fill with a right turn.
   */
  yawSign: 1 | -1;
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
  centredSince: number | null;
  heldSince: number | null;
  lostSince: number | null;
  startedAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CHALLENGE_CONFIG: LivenessChallengeConfig = {
  yawThreshold: 25,
  pitchThreshold: 15,
  holdMs: 300,
  positionMs: 500,
  lostGraceMs: 1000,
  timeoutMs: 30000,
  centredDegrees: 8,
  yawSign: 1,
};

/** The circle a face has to sit in, and the sizes that count as close enough */
const CENTRE_TOLERANCE = { x: 0.2, y: 0.25 };
const SIZE_RANGE = { min: 0.2, max: 0.9 };

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
    centredSince: null,
    heldSince: null,
    lostSince: null,
    startedAt: null,
  };
}

/** Whether one face sits in the circle, close enough */
export function isFaceInCircle(face: FaceSample | null): face is FaceSample {
  return (
    face !== null &&
    Math.abs(face.centerX - 0.5) <= CENTRE_TOLERANCE.x &&
    Math.abs(face.centerY - 0.5) <= CENTRE_TOLERANCE.y &&
    face.size >= SIZE_RANGE.min &&
    face.size <= SIZE_RANGE.max
  );
}

/** How far a face is turned in a direction, 0-1 */
export function directionProgress(
  face: FaceSample,
  direction: LivenessDirection,
  config: LivenessChallengeConfig = DEFAULT_CHALLENGE_CONFIG
): number {
  const raw =
    direction === 'left'
      ? (config.yawSign * face.yaw) / config.yawThreshold
      : direction === 'right'
        ? (-config.yawSign * face.yaw) / config.yawThreshold
        : face.pitch / config.pitchThreshold;
  return Math.min(1, Math.max(0, raw));
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

  // Too long: start again, in the same order
  if (state.startedAt !== null && now - state.startedAt > config.timeoutMs) {
    return startChallenge(state.steps);
  }

  if (!isFaceInCircle(face)) {
    const lostSince = state.lostSince ?? now;
    if (state.phase === 'positioning') {
      return { ...state, centredSince: null, lostSince };
    }
    if (state.phase !== 'faceLost' && now - lostSince > config.lostGraceMs) {
      return { ...state, phase: 'faceLost', resume: state.phase, heldSince: null, lostSince };
    }
    return { ...state, lostSince };
  }

  let next: LivenessChallengeState = { ...state, lostSince: null };
  if (next.phase === 'faceLost') {
    next = { ...next, phase: next.resume ?? 'challenge', resume: null };
  }

  switch (next.phase) {
    case 'positioning': {
      const centredSince = next.centredSince ?? now;
      if (now - centredSince >= config.positionMs) {
        return { ...next, phase: 'challenge', centredSince: null, startedAt: now, index: 0, progress: 0 };
      }
      return { ...next, centredSince };
    }
    case 'challenge': {
      const direction = next.steps[next.index];
      const progress = directionProgress(face, direction, config);
      if (progress < 1) {
        return { ...next, progress, heldSince: null };
      }
      const heldSince = next.heldSince ?? now;
      if (now - heldSince < config.holdMs) {
        return { ...next, progress, heldSince };
      }
      const completed = [...next.completed, direction];
      const index = next.index + 1;
      return index >= next.steps.length
        ? { ...next, completed, index: next.steps.length, progress: 1, heldSince: null, phase: 'centering' }
        : { ...next, completed, index, progress: 0, heldSince: null };
    }
    case 'centering': {
      const facing = Math.abs(face.yaw) < config.centredDegrees && Math.abs(face.pitch) < config.centredDegrees;
      return facing && face.eyesOpen !== false ? { ...next, phase: 'capturing' } : next;
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
