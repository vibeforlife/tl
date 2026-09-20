import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getOptimizedImageDimensions,
  JPEG_QUALITY,
  MAX_IMAGE_DIMENSION,
  MAX_OPTIMIZED_IMAGE_BYTES,
  MIN_JPEG_QUALITY,
} from '../src/services/firebase/imageOptimization';

describe('Image optimization', () => {
  it('keeps images already within the maximum dimension', () => {
    expect(
      getOptimizedImageDimensions(1600, 1200),
    ).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it('resizes landscape images proportionally', () => {
    expect(
      getOptimizedImageDimensions(6000, 4000),
    ).toEqual({
      width: MAX_IMAGE_DIMENSION,
      height: 1707,
    });
  });

  it('resizes portrait images proportionally', () => {
    expect(
      getOptimizedImageDimensions(4000, 6000),
    ).toEqual({
      width: 1707,
      height: MAX_IMAGE_DIMENSION,
    });
  });

  it('uses the intended JPEG quality range', () => {
    expect(JPEG_QUALITY).toBeGreaterThanOrEqual(0.8);
    expect(JPEG_QUALITY).toBeLessThanOrEqual(0.85);
    expect(MIN_JPEG_QUALITY).toBeLessThan(JPEG_QUALITY);
  });

  it('targets approximately 3 MB or less', () => {
    expect(MAX_OPTIMIZED_IMAGE_BYTES).toBe(
      3 * 1024 * 1024,
    );
  });

  it('rejects invalid dimensions', () => {
    expect(() =>
      getOptimizedImageDimensions(0, 1000),
    ).toThrow();

    expect(() =>
      getOptimizedImageDimensions(1000, 0),
    ).toThrow();
  });
});

describe('Storage upload implementation', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/services/firebase/storage.ts',
    ),
    'utf8',
  );

  it('uses resumable Firebase uploads', () => {
    expect(source).toContain(
      'uploadBytesResumable',
    );
    expect(source).not.toContain(
      'uploadBytes(',
    );
    expect(source).toContain(
      'state_changed',
    );
    expect(source).toContain(
      'bytesTransferred',
    );
  });
});
