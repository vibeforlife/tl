import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(
    process.cwd(),
    'src/features/entries/CreateEntryForm.tsx',
  ),
  'utf8',
);

describe('Memory photo preparation and preview', () => {
  it('optimizes selected photos before preview and upload', () => {
    expect(source).toContain(
      'await optimizeImageFile(file)',
    );
    expect(source).toContain(
      'setPendingPhotoFile(optimizedFile)',
    );
    expect(source).toContain(
      "setPhotoProcessingState('processing')",
    );
    expect(source).toContain(
      "setPhotoProcessingState('ready')",
    );
  });

  it('does not use FileReader data URLs', () => {
    expect(source).not.toContain(
      'new FileReader()',
    );
    expect(source).not.toContain(
      'reader.readAsDataURL',
    );
  });

  it('does not allow saving while a photo is being prepared', () => {
    expect(source).toContain(
      "photoProcessingState === 'processing'",
    );
    expect(source).toContain(
      'Preparing photo…',
    );
  });

  it('reports resumable upload progress', () => {
    expect(source).toContain(
      'setPhotoUploadProgress(progress)',
    );
  });
});
