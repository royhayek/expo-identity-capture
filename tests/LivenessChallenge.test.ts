import { DEFAULT_CHALLENGE_CONFIG, advanceChallenge, startChallenge, type FaceSample, type LivenessChallengeState } from '../src/services/LivenessChallenge';

const face = (patch: Partial<FaceSample> = {}): FaceSample => ({ yaw: 0, pitch: 0, centerX: 0.5, centerY: 0.5, size: 0.5, eyesOpen: null, ...patch });
const centering = (): LivenessChallengeState => ({
  ...startChallenge(['left']),
  phase: 'centering',
  index: 1,
  completed: ['left'],
  neutral: { yaw: 0, pitch: 0, samples: 6 },
});
/** Feeds a sample every 100 ms; answers when the photo is taken, or null */
const capturesAt = (samples: (i: number) => FaceSample, state = centering(), limit = 6000): number | null => {
  for (let t = 0; t < limit; t += 100) {
    state = advanceChallenge(state, samples(t / 100), t);
    if (state.phase === 'capturing') return t;
  }
  return null;
};

describe('facing the camera again, before the photo', () => {
  // Apple Vision's pitch on a still head, as logged on a device: it wanders by 10° and more
  const PITCH = [0.1, 6.3, 11.4, 1.9, 3.1, 6.8, 18.4, -1.5, 1.8, 11.3, 12.1, 6.4, 9.9, 13.6, 5.1, 2.1, 10.7, 8.5];

  it('takes the photo despite the detector’s noise', () => {
    expect(capturesAt((i) => face({ yaw: (i % 3) - 1, pitch: PITCH[i % PITCH.length] }))).toBe(DEFAULT_CHALLENGE_CONFIG.alignMs);
  });

  it('takes it with the face close and a little off-centre, as after a turn', () => {
    expect(capturesAt(() => face({ centerX: 0.72, centerY: 0.6, size: 0.93 }))).not.toBeNull();
  });

  it('holds it back while the head is still turned or tilted', () => {
    expect(capturesAt(() => face({ yaw: 15 }))).toBeNull();
    expect(capturesAt(() => face({ pitch: 20 }))).toBeNull();
    expect(capturesAt(() => face({ pitch: -20 }))).toBeNull();
  });

  it('holds it back with the face out of the circle, or too far', () => {
    expect(capturesAt(() => face({ centerX: 0.9 }))).toBeNull();
    expect(capturesAt(() => face({ size: 0.1 }))).toBeNull();
  });
});

describe('the turns', () => {
  it('completes a turn held past the threshold, measured from the customer’s own neutral', () => {
    let state: LivenessChallengeState = startChallenge(['left']);
    // Placing the face, its resting head slightly turned
    for (let t = 0; t <= 700; t += 100) state = advanceChallenge(state, face({ yaw: 5 }), t);
    expect(state.phase).toBe('challenge');
    for (let t = 800; t <= 1400; t += 100) state = advanceChallenge(state, face({ yaw: 5 + 16 }), t);
    expect(state.phase).toBe('centering');
  });

  it('does not count the resting pose as a turn', () => {
    let state: LivenessChallengeState = startChallenge(['left']);
    for (let t = 0; t <= 3000; t += 100) state = advanceChallenge(state, face({ yaw: 12 }), t);
    expect(state.phase).toBe('challenge');
  });
});

describe('a recorded or looped video of head turns', () => {
  /** Places the face, then plays `turns` (yaw/pitch per 100 ms) */
  const play = (steps: ('left' | 'right' | 'up')[], turns: Partial<FaceSample>[]) => {
    let state: LivenessChallengeState = startChallenge(steps);
    let t = 0;
    for (; t <= 700; t += 100) state = advanceChallenge(state, face(), t);
    for (const turn of turns) {
      state = advanceChallenge(state, face(turn), t);
      t += 100;
    }
    return state;
  };
  const hold = (turn: Partial<FaceSample>, ms: number) => Array.from({ length: ms / 100 }, () => turn);
  const LEFT = { yaw: 20 };
  const RIGHT = { yaw: -20 };

  it('forgives one wrong turn: the asked step starts afresh, nothing done is lost', () => {
    const state = play(['right', 'left', 'up'], [...hold(LEFT, 500), ...hold({}, 300)]);
    expect(state).toMatchObject({ phase: 'challenge', index: 0, wrongTurns: 1 });
  });

  it('restarts the whole challenge on a second wrong turn: a video plays its own order', () => {
    const state = play(['right', 'left', 'up'], [...hold(LEFT, 500), ...hold({}, 300), ...hold(LEFT, 500)]);
    expect(state).toMatchObject({ phase: 'positioning', completed: [], wrongTurns: 0 });
  });

  it('never counts the way back from the step just done as a wrong turn', () => {
    const state = play(['left', 'right', 'up'], [...hold(LEFT, 600), ...hold(LEFT, 600), ...hold(RIGHT, 600)]);
    expect(state.completed).toEqual(['left', 'right']);
  });
});
