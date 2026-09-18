import { describe, expect, it } from 'vitest';

import {
  buildEntryPhotoPath,
  validateImageFile,
} from '../src/services/firebase/storage';

const makeFile = (
  name: string,
  type: string,
  size: number,
): File => {
  return new File([new Uint8Array(size)], name, { type });
};

describe('Image validation', () => {
  it('accepts supported image types', () => {
    expect(validateImageFile(makeFile('photo.jpg', 'image/jpeg', 100))).toBeNull();
    expect(validateImageFile(makeFile('photo.png', 'image/png', 100))).toBeNull();
    expect(validateImageFile(makeFile('photo.webp', 'image/webp', 100))).toBeNull();
    expect(validateImageFile(makeFile('photo.heic', 'image/heic', 100))).toBeNull();
    expect(validateImageFile(makeFile('photo.heif', 'image/heif', 100))).toBeNull();
  });

  it('rejects unsupported file types', () => {
    expect(validateImageFile(makeFile('document.pdf', 'application/pdf', 100))).toBe(
      'Please choose a JPEG, PNG, WebP, HEIC, or HEIF image.',
    );
  });

  it('rejects empty files', () => {
    expect(validateImageFile(makeFile('empty.jpg', 'image/jpeg', 0))).toBe(
      'The selected image is empty.',
    );
  });

  it('rejects images larger than 20 MB', () => {
    expect(
      validateImageFile(
        makeFile('large.jpg', 'image/jpeg', 20 * 1024 * 1024 + 1),
      ),
    ).toBe('Images must be 20 MB or smaller.');
  });

  it('accepts an image exactly at the 20 MB limit', () => {
    expect(
      validateImageFile(
        makeFile('limit.jpg', 'image/jpeg', 20 * 1024 * 1024),
      ),
    ).toBeNull();
  });
});

describe('Entry photo Storage paths', () => {
  it('creates the expected journey entry path', () => {
    const path = buildEntryPhotoPath(
      'user-123',
      'journey-456',
      'entry-789',
      'sunset photo.jpg',
    );

    expect(path).toMatch(
      /^journeys\/journey-456\/entries\/entry-789\/user-123\/[0-9a-f-]{36}-sunset-photo\.jpg$/,
    );
  });

  it('sanitizes unsafe filename characters', () => {
    const path = buildEntryPhotoPath(
      'user-123',
      'journey-456',
      'entry-789',
      'My photo (Oia)! #1.jpg',
    );

    expect(path).toMatch(
      /^journeys\/journey-456\/entries\/entry-789\/user-123\/[0-9a-f-]{36}-My-photo-Oia-1\.jpg$/,
    );
  });

  it('generates different paths for repeated uploads', () => {
    const first = buildEntryPhotoPath(
      'user-123',
      'journey-456',
      'entry-789',
      'photo.jpg',
    );

    const second = buildEntryPhotoPath(
      'user-123',
      'journey-456',
      'entry-789',
      'photo.jpg',
    );

    expect(first).not.toBe(second);
  });
});
