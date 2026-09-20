import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/entries/CreateEntryForm.tsx'),
  'utf8',
);

describe('Memory photo mobile preview', () => {
  it('uses FileReader data URLs for selected photo previews', () => {
    expect(source).toContain('const reader = new FileReader();');
    expect(source).toContain('reader.readAsDataURL(pendingPhotoFile);');
    expect(source).toContain(
      "typeof reader.result === 'string'",
    );
  });

  it('does not use object URLs for memory photo previews', () => {
    expect(source).not.toContain(
      'URL.createObjectURL(pendingPhotoFile)',
    );
    expect(source).not.toContain(
      'URL.revokeObjectURL(previewUrl)',
    );
  });

  it('cancels the previous FileReader when the selected photo changes', () => {
    expect(source).toContain('let cancelled = false;');
    expect(source).toContain('cancelled = true;');
    expect(source).toContain('reader.abort();');
  });
});
