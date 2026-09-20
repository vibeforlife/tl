export const MAX_IMAGE_DIMENSION = 2560;
export const JPEG_QUALITY = 0.82;
export const MIN_JPEG_QUALITY = 0.68;
export const MAX_OPTIMIZED_IMAGE_BYTES = 3 * 1024 * 1024;


export const getOptimizedImageDimensions = (
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION,
): { width: number; height: number } => {
  if (width <= 0 || height <= 0) {
    throw new Error('The selected image has invalid dimensions.');
  }

  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / Math.max(width, height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

type DecodedImage = ImageBitmap | HTMLImageElement;

const decodeImage = async (file: File): Promise<DecodedImage> => {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      return await window.createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
    } catch {
      // Fall through to HTMLImageElement decoding.
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const closeDecodedImage = (image: DecodedImage) => {
  if ('close' in image && typeof image.close === 'function') {
    image.close();
  }
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(
            new Error(
              'The browser could not create the optimized image.',
            ),
          );
        }
      },
      'image/jpeg',
      quality,
    );
  });

const createJpegFile = async (
  image: DecodedImage,
  width: number,
  height: number,
  quality: number,
  baseName: string,
): Promise<File> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error(
      'The browser could not prepare the image for upload.',
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(
    image,
    0,
    0,
    width,
    height,
  );

  const blob = await canvasToBlob(canvas, quality);

  return new File(
    [blob],
    `${baseName}.jpg`,
    {
      type: 'image/jpeg',
      lastModified: Date.now(),
    },
  );
};

export const optimizeImageFile = async (
  file: File,
): Promise<File> => {

  const image = await decodeImage(file);

  try {
    const sourceWidth =
      'naturalWidth' in image
        ? image.naturalWidth
        : image.width;

    const sourceHeight =
      'naturalHeight' in image
        ? image.naturalHeight
        : image.height;

    const dimensions = getOptimizedImageDimensions(
      sourceWidth,
      sourceHeight,
    );

    const baseName =
      file.name.replace(/\.[^/.]+$/, '').trim() ||
      'photo';

    let quality = JPEG_QUALITY;

    let optimizedFile = await createJpegFile(
      image,
      dimensions.width,
      dimensions.height,
      quality,
      baseName,
    );

    while (
      optimizedFile.size > MAX_OPTIMIZED_IMAGE_BYTES &&
      quality > MIN_JPEG_QUALITY
    ) {
      quality = Math.max(
        MIN_JPEG_QUALITY,
        Number((quality - 0.04).toFixed(2)),
      );

      optimizedFile = await createJpegFile(
        image,
        dimensions.width,
        dimensions.height,
        quality,
        baseName,
      );
    }

    if (optimizedFile.size > MAX_OPTIMIZED_IMAGE_BYTES) {
      throw new Error(
        'This photo is too detailed to optimize below 3 MB. Please choose a different photo.',
      );
    }

    return optimizedFile;
  } finally {
    closeDecodedImage(image);
  }
};
