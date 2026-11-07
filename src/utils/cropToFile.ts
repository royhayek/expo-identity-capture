import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops a photo and saves it as a JPEG, decoding it once (its EXIF orientation applied, so the crop is in what the
 * customer saw) and releasing every native image as soon as it is used: an 11 MP photo is ~45 MB decoded, and a
 * low-end phone can't hold several until the JS garbage collector gets to them.
 */
export async function cropToFile(
  uri: string,
  cropOf: (width: number, height: number) => Crop,
  quality: number
): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  context.release();
  try {
    const crop = cropOf(image.width, image.height);
    const cropping = ImageManipulator.manipulate(image).crop({
      originX: crop.x,
      originY: crop.y,
      width: crop.width,
      height: crop.height,
    });
    const cropped = await cropping.renderAsync();
    cropping.release();
    try {
      return await cropped.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    } finally {
      cropped.release();
    }
  } finally {
    image.release();
  }
}
