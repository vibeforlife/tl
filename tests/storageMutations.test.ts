import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  getStorage: vi.fn(() => ({
    __testType: 'storage',
  })),
  ref: vi.fn((_storage: unknown, path: string) => ({
    path,
  })),
  uploadBytesResumable: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
}));

vi.mock('../src/services/firebase/config', () => ({
  firebaseApp: {
    __testType: 'firebaseApp',
  },
}));

import {
  deleteStorageFile,
  uploadEntryPhoto,
} from '../src/services/firebase/storage';

const makeFile = (
  name: string,
  type: string,
  size: number,
): File => {
  return new File([new Uint8Array(size)], name, { type });
};

const makeSuccessfulUploadTask = () => {
  const snapshot = {
    bytesTransferred: 100,
    totalBytes: 100,
    ref: {
      path: 'uploaded/path/photo.jpg',
    },
  };

  const uploadTask = {
    snapshot,
    on: vi.fn(
      (
        _event: string,
        progressHandler: (snapshot: typeof snapshot) => void,
        _errorHandler: (error: Error) => void,
        completeHandler: () => void,
      ) => {
        progressHandler(snapshot);
        completeHandler();
      },
    ),
  };

  return uploadTask;
};

describe('Storage mutation services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadEntryPhoto', () => {
    it('uploads a valid image, reports progress, gets its download URL, and returns the photo metadata', async () => {
      const uploadTask = makeSuccessfulUploadTask();
      uploadBytesResumable.mockReturnValue(uploadTask);
      getDownloadURL.mockResolvedValue(
        'https://storage.example/photo.jpg',
      );

      const onProgress = vi.fn();
      const file = makeFile(
        'sunset photo.jpg',
        'image/jpeg',
        100,
      );

      const result = await uploadEntryPhoto(
        'user-123',
        'journey-456',
        'entry-789',
        file,
        onProgress,
      );

      expect(ref).toHaveBeenCalledTimes(1);
      expect(ref).toHaveBeenCalledWith(
        { __testType: 'storage' },
        expect.stringMatching(
          /^journeys\/journey-456\/entries\/entry-789\/user-123\/[0-9a-f-]{36}-sunset-photo\.jpg$/,
        ),
      );

      expect(uploadBytesResumable).toHaveBeenCalledTimes(1);
      expect(uploadBytesResumable).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringMatching(
            /^journeys\/journey-456\/entries\/entry-789\/user-123\/[0-9a-f-]{36}-sunset-photo\.jpg$/,
          ),
        }),
        file,
        {
          contentType: 'image/jpeg',
        },
      );

      expect(onProgress).toHaveBeenCalledWith(100);

      expect(getDownloadURL).toHaveBeenCalledTimes(1);
      expect(getDownloadURL).toHaveBeenCalledWith(
        uploadTask.snapshot.ref,
      );

      expect(result).toEqual({
        path: expect.stringMatching(
          /^journeys\/journey-456\/entries\/entry-789\/user-123\/[0-9a-f-]{36}-sunset-photo\.jpg$/,
        ),
        url: 'https://storage.example/photo.jpg',
      });
    });

    it('does not touch Storage when validation fails', async () => {
      const file = makeFile(
        'document.pdf',
        'application/pdf',
        100,
      );

      await expect(
        uploadEntryPhoto(
          'user-123',
          'journey-456',
          'entry-789',
          file,
        ),
      ).rejects.toThrow(
        'Please choose a JPEG, PNG, WebP, HEIC, or HEIF image.',
      );

      expect(ref).not.toHaveBeenCalled();
      expect(uploadBytesResumable).not.toHaveBeenCalled();
      expect(getDownloadURL).not.toHaveBeenCalled();
    });

    it('propagates an upload failure', async () => {
      const uploadError = new Error('Storage upload failed');
      const uploadTask = {
        snapshot: {
          bytesTransferred: 0,
          totalBytes: 100,
          ref: {
            path: 'uploaded/path/photo.jpg',
          },
        },
        on: vi.fn(
          (
            _event: string,
            _progressHandler: (snapshot: unknown) => void,
            errorHandler: (error: Error) => void,
          ) => {
            errorHandler(uploadError);
          },
        ),
      };

      uploadBytesResumable.mockReturnValue(uploadTask);

      const file = makeFile(
        'sunset.jpg',
        'image/jpeg',
        100,
      );

      await expect(
        uploadEntryPhoto(
          'user-123',
          'journey-456',
          'entry-789',
          file,
        ),
      ).rejects.toBe(uploadError);

      expect(getDownloadURL).not.toHaveBeenCalled();
    });

    it('propagates a download URL failure after a successful upload', async () => {
      const uploadTask = makeSuccessfulUploadTask();
      const urlError = new Error('Download URL failed');

      uploadBytesResumable.mockReturnValue(uploadTask);
      getDownloadURL.mockRejectedValue(urlError);

      const file = makeFile(
        'sunset.jpg',
        'image/jpeg',
        100,
      );

      await expect(
        uploadEntryPhoto(
          'user-123',
          'journey-456',
          'entry-789',
          file,
        ),
      ).rejects.toBe(urlError);
    });
  });

  describe('deleteStorageFile', () => {
    it('deletes the requested Storage path', async () => {
      deleteObject.mockResolvedValue(undefined);

      await deleteStorageFile(
        'journeys/journey-456/entries/entry-789/user-123/photo.jpg',
      );

      expect(ref).toHaveBeenCalledWith(
        { __testType: 'storage' },
        'journeys/journey-456/entries/entry-789/user-123/photo.jpg',
      );
      expect(deleteObject).toHaveBeenCalledTimes(1);
      expect(deleteObject).toHaveBeenCalledWith({
        path: 'journeys/journey-456/entries/entry-789/user-123/photo.jpg',
      });
    });

    it('propagates a Storage delete failure', async () => {
      const deleteError = new Error('Storage delete failed');
      deleteObject.mockRejectedValue(deleteError);

      await expect(
        deleteStorageFile(
          'journeys/journey-456/entries/entry-789/user-123/photo.jpg',
        ),
      ).rejects.toBe(deleteError);
    });
  });
});
