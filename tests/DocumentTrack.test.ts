import { EMPTY_TRACK, trackDocument, type DocumentTrack, type DetectionUpdate } from '../src/hooks/useDocumentDetection';

const CFG = { autoCaptureConfidence: 0.75, stabilityThreshold: 40, maxMissedFrames: 3 };
const STABLE = 6;
const at = (dx = 0) => ({
  topLeft: { x: 100 + dx, y: 100 },
  topRight: { x: 500 + dx, y: 100 },
  bottomRight: { x: 500 + dx, y: 350 },
  bottomLeft: { x: 100 + dx, y: 350 },
});
const seen = (dx = 0, confidence = 0.88): DetectionUpdate => ({ isDetected: true, corners: at(dx), confidence });
const missed: DetectionUpdate = { isDetected: false, corners: null, confidence: 0 };

/** Frames analysed until the document counts as held still, or null */
const lockedAfter = (frames: DetectionUpdate[]): number | null => {
  let track: DocumentTrack = EMPTY_TRACK;
  for (let i = 0; i < frames.length; i++) {
    track = trackDocument(track, frames[i], CFG);
    if (track.hits >= STABLE) return i + 1;
  }
  return null;
};

describe('a document held in the guide', () => {
  it('locks after the stable frames', () => {
    expect(lockedAfter(Array.from({ length: 10 }, () => seen()))).toBe(STABLE);
  });

  // Edge detection misses frames of a hand-held card: each one started the count over, many seconds of holding still
  it('forgives a missed or doubtful frame now and then', () => {
    const frames = [seen(), seen(), missed, seen(), seen(0, 0.64), seen(), missed, missed, seen(), seen()];
    expect(lockedAfter(frames)).toBe(frames.length);
  });

  it('keeps showing it through a missed frame, and drops it once really gone', () => {
    let track = trackDocument(EMPTY_TRACK, seen(), CFG);
    track = trackDocument(track, missed, CFG);
    expect(track.corners).not.toBeNull();
    for (let i = 0; i < CFG.maxMissedFrames; i++) track = trackDocument(track, missed, CFG);
    expect(track).toEqual(EMPTY_TRACK);
  });

  it('starts over when the document moves', () => {
    const frames = [seen(), seen(), seen(), seen(), seen(80), seen(80), seen(80)];
    expect(lockedAfter(frames)).toBeNull();
    expect(lockedAfter([...frames, seen(80), seen(80), seen(80)])).toBe(frames.length + 3);
  });
});
