import { guideBox } from '../src/utils/guide';
import { sitsInGuide } from '../src/core/OpenCVFrameProcessor';


/** An axis-aligned outline in frame pixels */
const outline = (x: number, y: number, width: number, height: number) => ({
  topLeft: { x, y },
  topRight: { x: x + width, y },
  bottomLeft: { x, y: y + height },
  bottomRight: { x: x + width, y: y + height },
});

describe('sitsInGuide', () => {
  // The wallet's viewport (362 × 400) and a card guide; a 1280 × 720 frame stored sideways (Android back camera)
  const view = { width: 362, height: 400 };
  const card = guideBox(view.width, view.height, 'civil_id');
  const sideways = { sideways: true, view, guide: card };
  // Upright, the frame is 720 × 1280, scaled by 400 / 1280 … no: by max(362 / 720, 400 / 1280) = 0.503 to cover the view
  const scale = Math.max(view.width / 720, view.height / 1280);
  const guideW = card.width / scale; // across the upright frame, along the stored frame's height
  const guideH = card.height / scale;

  it('takes a card filling the guide, in the stored frame’s axes', () => {
    // Stored sideways: the upright width runs along the stored y axis
    expect(sitsInGuide(outline(640 - guideH / 2, 360 - guideW / 2, guideH, guideW), 1280, 720, sideways)).toBe(true);
  });

  it('refuses an outline off to one side, or far smaller or larger than the guide', () => {
    expect(sitsInGuide(outline(100, 360 - guideW / 2, guideH, guideW), 1280, 720, sideways)).toBe(false);
    expect(sitsInGuide(outline(600, 340, guideH / 3, guideW / 3), 1280, 720, sideways)).toBe(false);
    expect(sitsInGuide(outline(0, 0, 1280, 720), 1280, 720, sideways)).toBe(false);
  });

  it('refuses an open passport’s two pages, takes the data page in the guide', () => {
    const page = guideBox(view.width, view.height, 'passport');
    const upright = { sideways: false, view, guide: page };
    const pageW = page.width / scale;
    const pageH = page.height / scale;
    // Upright frame 720 × 1280: the data page centred, the facing page above it
    expect(sitsInGuide(outline(360 - pageW / 2, 640 - pageH / 2, pageW, pageH), 720, 1280, upright)).toBe(true);
    expect(sitsInGuide(outline(360 - pageW / 2, 640 - pageH * 1.5, pageW, pageH * 2), 720, 1280, upright)).toBe(false);
  });
});

describe('the frames analysed, framed like the preview', () => {
  const resolutionOn = (os: string): { width: number; height: number } => {
    let resolution = { width: 0, height: 0 };
    jest.isolateModules(() => {
      require('react-native').Platform.OS = os;
      resolution = require('../src/utils/guide').FRAME_RESOLUTION;
    });
    return resolution;
  };

  // CameraX frames each output on its own and its preview is 4:3: 16:9 frames held upright showed 3/4 of the width the
  // customer saw, and an ID card filling the guide (about 0.85 of it) had its edges outside them
  it('asks Android for 4:3 frames, like its preview', () => {
    const { width, height } = resolutionOn('android');
    expect(width / height).toBeCloseTo(4 / 3);
  });

  it('keeps iOS as it was: one capture format feeds the preview and the frames', () => {
    expect(resolutionOn('ios')).toEqual({ width: 1280, height: 720 });
  });
});
