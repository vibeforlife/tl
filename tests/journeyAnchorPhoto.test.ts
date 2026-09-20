import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  deleteField: vi.fn(() => ({
    __testType: 'deleteField',
  })),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({
    __testType: 'serverTimestamp',
  })),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../src/services/firebase/firestore', () => ({
  db: { __testDb: true },
}));

import {
  clearJourneyAnchorPhoto,
  updateJourneyAnchorPhoto,
} from '../src/services/firebase/journeys';

const repoRoot = process.cwd();

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8');

describe('Journey anchor photo Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the complete anchor photo metadata to the Journey', async () => {
    const anchorPhoto = {
      url: 'https://example.com/anchor.jpg',
      storagePath: 'journeys/journey-123/anchor/photo.jpg',
    };

    await updateJourneyAnchorPhoto('journey-123', anchorPhoto);

    const { doc, updateDoc, serverTimestamp } =
      await import('firebase/firestore');

    expect(doc).toHaveBeenCalledWith(
      { __testDb: true },
      'journeys',
      'journey-123',
    );

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'journeys/journey-123' },
      {
        anchorPhoto,
        updatedAt: { __testType: 'serverTimestamp' },
      },
    );
    expect(serverTimestamp).toHaveBeenCalledTimes(1);
  });

  it('removes the Journey anchor photo metadata and updates the timestamp', async () => {
    await clearJourneyAnchorPhoto('journey-123');

    const { doc, updateDoc, deleteField, serverTimestamp } =
      await import('firebase/firestore');

    expect(doc).toHaveBeenCalledWith(
      { __testDb: true },
      'journeys',
      'journey-123',
    );

    expect(deleteField).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'journeys/journey-123' },
      {
        anchorPhoto: { __testType: 'deleteField' },
        updatedAt: { __testType: 'serverTimestamp' },
      },
    );
    expect(serverTimestamp).toHaveBeenCalledTimes(1);
  });
});

describe('Journey anchor photo implementation contracts', () => {
  it('defines the Journey anchor photo shape with url and storagePath', () => {
    const source = readRepoFile('src/types/domain.ts');

    expect(source).toContain('export interface JourneyPhoto');
    expect(source).toMatch(
      /export interface JourneyPhoto\s*\{[\s\S]*?url:\s*string;[\s\S]*?storagePath:\s*string;[\s\S]*?\}/,
    );
    expect(source).toContain('anchorPhoto?: JourneyPhoto;');
  });

  it('keeps the anchor photo upload in the dedicated Journey anchor path', () => {
    const source = readRepoFile('src/services/firebase/storage.ts');

    expect(source).toContain(
      'return `journeys/${journeyId}/anchor/${crypto.randomUUID()}-${finalFileName}`;',
    );
    expect(source).toContain('export const uploadJourneyAnchorPhoto');
  });

  it('protects JourneyDetail anchor photo preparation from stale selections', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain('anchorPhotoSelectionGenerationRef');
    expect(source).toContain(
      'anchorPhotoSelectionGenerationRef.current !==',
    );
    expect(source).toContain(
      'anchorPhotoSelectionGenerationRef.current += 1;',
    );
  });

  it('shows JourneyDetail anchor photo upload progress', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain('anchorPhotoUploadProgress');
    expect(source).toContain('Uploading photo {anchorPhotoUploadProgress}%');
    expect(source).toContain(
      '(progress) => setAnchorPhotoUploadProgress(progress)',
    );
  });

  it('optimizes and protects new Journey anchor photo selection', () => {
    const source = readRepoFile('src/features/journeys/CreateJourneyForm.tsx');

    expect(source).toContain(
      "import { optimizeImageFile } from '../../services/firebase/imageOptimization';",
    );
    expect(source).toContain('optimizeImageFile(file)');
    expect(source).toContain('anchorPhotoSelectionGenerationRef');
    expect(source).toContain(
      'anchorPhotoSelectionGenerationRef.current !==',
    );
  });

  it('shows new Journey anchor photo upload progress', () => {
    const source = readRepoFile('src/features/journeys/CreateJourneyForm.tsx');

    expect(source).toContain('anchorPhotoUploadProgress');
    expect(source).toContain('Uploading photo {anchorPhotoUploadProgress}%');
    expect(source).toContain(
      '(progress) => setAnchorPhotoUploadProgress(progress)',
    );
  });

  it('creates the Journey first and then attaches an optional anchor photo', () => {
    const source = readRepoFile('src/features/journeys/CreateJourneyForm.tsx');

    expect(source).toContain('const journeyId = await createJourney(user, form);');
    expect(source).toContain('if (anchorPhoto)');
    expect(source).toContain(
      'const uploadedPhoto = await uploadJourneyAnchorPhoto(',
    );
    expect(source).toContain(
      'await updateJourneyAnchorPhoto(journeyId, {',
    );
    expect(source).toContain('url: uploadedPhoto.url,');
    expect(source).toContain('storagePath: uploadedPhoto.path,');
  });

  it('preserves the Journey when anchor photo upload fails', () => {
    const source = readRepoFile('src/features/journeys/CreateJourneyForm.tsx');

    expect(source).toContain(
      'Journey created, but the anchor photo could not be uploaded:',
    );
    expect(source).toContain(
      'You can add it later.',
    );

    const createJourneyIndex = source.indexOf(
      'const journeyId = await createJourney(user, form);',
    );
    const uploadIndex = source.indexOf(
      'const uploadedPhoto = await uploadJourneyAnchorPhoto(',
    );
    const photoErrorIndex = source.indexOf(
      'Journey created, but the anchor photo could not be uploaded:',
    );

    expect(createJourneyIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(createJourneyIndex);
    expect(photoErrorIndex).toBeGreaterThan(uploadIndex);
  });

  it('cleans up a newly uploaded photo if Firestore metadata update fails', () => {
    const source = readRepoFile('src/features/journeys/CreateJourneyForm.tsx');

    expect(source).toContain(
      'await deleteStorageFile(uploadedPhoto.path);',
    );

    const metadataIndex = source.indexOf(
      'await updateJourneyAnchorPhoto(journeyId, {',
    );
    const cleanupIndex = source.indexOf(
      'await deleteStorageFile(uploadedPhoto.path);',
    );

    expect(metadataIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThan(metadataIndex);
  });

  it('supports replacing an existing Journey anchor photo', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      'const previousAnchorPhoto = journey.anchorPhoto;',
    );
    expect(source).toContain(
      'const uploadedPhoto = await uploadJourneyAnchorPhoto(',
    );
    expect(source).toContain(
      'await updateJourneyAnchorPhoto(journey.id, {',
    );
    expect(source).toContain(
      'await deleteStorageFile(previousAnchorPhoto.storagePath);',
    );
  });

  it('supports removing the existing Journey anchor photo', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      'else if (removeAnchorPhoto && previousAnchorPhoto)',
    );
    expect(source).toContain(
      'await clearJourneyAnchorPhoto(journey.id);',
    );
    expect(source).toContain(
      'nextAnchorPhoto = undefined;',
    );
    expect(source).toContain(
      'await deleteStorageFile(previousAnchorPhoto.storagePath);',
    );
  });

  it('keeps the old photo active if replacement metadata cannot be saved', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      'await deleteStorageFile(uploadedPhoto.path);',
    );
    expect(source).toContain(
      'The old photo remains the active photo.',
    );
  });

  it('uses the anchor photo as the Journey card background', () => {
    const source = readRepoFile('src/features/journeys/JourneyHome.tsx');

    expect(source).toContain(
      "journey.anchorPhoto ? 'journey-card--has-photo' : ''",
    );
    expect(source).toContain(
      'backgroundImage: `url("${journey.anchorPhoto.url}")`',
    );
    expect(source).toContain('journey-card__photo-overlay');
  });

  it('uses the anchor photo as the Journey detail hero background', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      "journey.anchorPhoto ? ' journey-hero--has-photo' : ''",
    );
    expect(source).toContain(
      'backgroundImage: `url("${journey.anchorPhoto.url}")`',
    );
    expect(source).toContain('journey-hero__photo-overlay');
  });

  it('provides an immediate preview for a newly selected anchor photo', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      'URL.createObjectURL(editAnchorPhoto)',
    );
    expect(source).toContain(
      'URL.revokeObjectURL(previewUrl);',
    );
    expect(source).toContain(
      'alt="New anchor photo preview"',
    );
  });

  it('supports explicitly removing the existing anchor photo from the edit UI', () => {
    const source = readRepoFile('src/features/journeys/JourneyDetail.tsx');

    expect(source).toContain(
      'checked={removeAnchorPhoto}',
    );
    expect(source).toContain(
      'const shouldRemove = event.target.checked;',
    );
    expect(source).toContain(
      'setRemoveAnchorPhoto(shouldRemove);',
    );
    expect(source).toContain(
      'setEditAnchorPhoto(null);',
    );
    expect(source).toContain('Remove anchor photo');
  });

  it('defines the anchor-photo Firestore validation contract', () => {
    const source = readRepoFile('firestore.rules');

    expect(source).toContain('validJourneyAnchorPhoto');
    expect(source).toContain('anchorPhoto');
    expect(source).toContain('storagePath');
  });

  it('defines dedicated Storage rules for Journey anchor photos', () => {
    const source = readRepoFile('storage.rules');

    expect(source).toContain(
      'match /journeys/{journeyId}/anchor/{fileName}',
    );
    expect(source).toContain(
      'allow read: if journeyMember(journeyId);',
    );
    expect(source).toContain(
      'allow create, update: if canEditJourney(journeyId)',
    );
    expect(source).toContain(
      'allow delete: if canEditJourney(journeyId);',
    );
  });

  it('includes the Travel Lore home hero asset referenced by the application', () => {
    expect(
      existsSync(resolve(repoRoot, 'public/travel-lore-hero.jpg')),
    ).toBe(true);

    const source = readRepoFile('src/design/theme.css');

    expect(source).toContain('url("/travel-lore-hero.jpg")');
  });
});
