import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  'src/features/entries/CreateEntryForm.tsx',
  'utf8',
);

describe('CreateEntryForm mutation reliability contracts', () => {
  it('prevents a second submission while a save is already in progress', () => {
    expect(source).toContain('if (isSubmitting) return;');
    expect(source).toContain('setIsSubmitting(true);');
    expect(source).toContain('setIsSubmitting(false);');
  });

  it('uploads a replacement photo before updating the existing entry', () => {
    const uploadIndex = source.indexOf(
      'const uploaded = await uploadEntryPhoto(',
    );
    const updateIndex = source.indexOf(
      'await updateEntry(journeyId, entry.id, {',
    );

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeLessThan(updateIndex);
  });

  it('does not update the existing entry when the replacement photo upload fails', () => {
    const uploadIndex = source.indexOf(
      'const uploaded = await uploadEntryPhoto(',
    );
    const updateIndex = source.indexOf(
      'await updateEntry(journeyId, entry.id, {',
    );
    const updateFailureCleanupIndex = source.indexOf(
      'if (uploadedPhoto) {',
      updateIndex,
    );

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(uploadIndex);
    expect(updateFailureCleanupIndex).toBeGreaterThan(updateIndex);
  });

  it('cleans up a newly uploaded replacement photo when the Firestore update fails', () => {
    const updateCatchIndex = source.indexOf(
      '} catch (updateError) {',
    );
    const cleanupIndex = source.indexOf(
      'await deleteStorageFile(uploadedPhoto.storagePath);',
      updateCatchIndex,
    );
    const rethrowIndex = source.indexOf(
      'throw updateError;',
      updateCatchIndex,
    );

    expect(updateCatchIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(updateCatchIndex);
    expect(rethrowIndex).toBeGreaterThan(cleanupIndex);
  });

  it('attempts old-photo cleanup only after a successful existing-entry update', () => {
    const updateIndex = source.indexOf(
      'await updateEntry(journeyId, entry.id, {',
    );
    const updateCatchIndex = source.indexOf(
      '} catch (updateError) {',
      updateIndex,
    );
    const oldPhotoCleanupIndex = source.indexOf(
      'await deleteStorageFile(oldPhoto.storagePath);',
      updateCatchIndex,
    );

    expect(updateIndex).toBeGreaterThan(-1);
    expect(updateCatchIndex).toBeGreaterThan(updateIndex);
    expect(oldPhotoCleanupIndex).toBeGreaterThan(updateCatchIndex);
  });

  it('does not turn old-photo cleanup failure into a failed memory update', () => {
    const oldPhotoCleanupIndex = source.indexOf(
      'await deleteStorageFile(oldPhoto.storagePath);',
    );
    const warningIndex = source.indexOf(
      "console.warn('Memory updated, but the previous photo could not be removed.');",
      oldPhotoCleanupIndex,
    );
    const onUpdatedIndex = source.indexOf(
      'await onUpdated?.();',
      warningIndex,
    );

    expect(oldPhotoCleanupIndex).toBeGreaterThan(-1);
    expect(warningIndex).toBeGreaterThan(oldPhotoCleanupIndex);
    expect(onUpdatedIndex).toBeGreaterThan(warningIndex);
  });

  it('creates the memory before attempting an optional photo upload', () => {
    const createIndex = source.indexOf(
      'const entryId = await createEntry(user.uid, journeyId, {',
    );
    const uploadIndex = source.indexOf(
      'const uploaded = await uploadEntryPhoto(',
      createIndex,
    );

    expect(createIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(createIndex);
  });

  it('rolls back the newly created memory when the photo phase fails', () => {
    const photoCatchIndex = source.indexOf(
      '} catch (photoError) {',
    );
    const deleteEntryIndex = source.indexOf(
      'await deleteEntry(journeyId, entryId);',
      photoCatchIndex,
    );
    const rethrowIndex = source.indexOf(
      'throw photoError;',
      photoCatchIndex,
    );

    expect(photoCatchIndex).toBeGreaterThan(-1);
    expect(deleteEntryIndex).toBeGreaterThan(photoCatchIndex);
    expect(rethrowIndex).toBeGreaterThan(deleteEntryIndex);
  });

  it('cleans up an uploaded photo when the photo phase fails during creation', () => {
    const photoCatchIndex = source.indexOf(
      '} catch (photoError) {',
    );
    const cleanupIndex = source.indexOf(
      'await deleteStorageFile(uploadedPhoto.storagePath);',
      photoCatchIndex,
    );
    const deleteEntryIndex = source.indexOf(
      'await deleteEntry(journeyId, entryId);',
      cleanupIndex,
    );

    expect(photoCatchIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(photoCatchIndex);
    expect(deleteEntryIndex).toBeGreaterThan(cleanupIndex);
  });

  it('only resets the submitting state in the final cleanup path', () => {
    const setSubmittingFalseIndex = source.indexOf(
      'setIsSubmitting(false);',
    );
    const finallyIndex = source.lastIndexOf(
      '} finally {',
    );

    expect(setSubmittingFalseIndex).toBeGreaterThan(finallyIndex);
  });
});
