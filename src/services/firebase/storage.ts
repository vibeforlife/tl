import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadResult,
} from 'firebase/storage';

import { firebaseApp } from './config';

const storage = getStorage(firebaseApp);

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const maxImageSizeBytes = 20 * 1024 * 1024;

export type PhotoUploadProgressHandler = (
  progress: number,
) => void;

export const validateImageFile = (
  file: File,
): string | null => {
  if (!allowedImageTypes.has(file.type.toLowerCase())) {
    return 'Please choose a JPEG, PNG, WebP, HEIC, or HEIF image.';
  }

  if (file.size <= 0) {
    return 'The selected image is empty.';
  }

  if (file.size > maxImageSizeBytes) {
    return 'Images must be 20 MB or smaller.';
  }

  return null;
};

export const buildJourneyAnchorPhotoPath = (
  journeyId: string,
  fileName: string,
): string => {
  const safeFileName = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const finalFileName =
    safeFileName || 'anchor-photo';

  return `journeys/${journeyId}/anchor/${crypto.randomUUID()}-${finalFileName}`;
};

export const buildEntryPhotoPath = (
  userId: string,
  journeyId: string,
  entryId: string,
  fileName: string,
): string => {
  const safeFileName = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const finalFileName =
    safeFileName || 'photo';

  return `journeys/${journeyId}/entries/${entryId}/${userId}/${crypto.randomUUID()}-${finalFileName}`;
};

const uploadFileWithProgress = (
  path: string,
  file: File,
  onProgress?: PhotoUploadProgressHandler,
): Promise<UploadResult> =>
  new Promise((resolve, reject) => {
    const metadata: UploadMetadata = {
      contentType: file.type,
    };

    const photoRef = ref(storage, path);

    const uploadTask = uploadBytesResumable(
      photoRef,
      file,
      metadata,
    );

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress =
          snapshot.totalBytes > 0
            ? (snapshot.bytesTransferred /
                snapshot.totalBytes) *
              100
            : 0;

        onProgress?.(Math.round(progress));
      },
      reject,
      () => resolve(uploadTask.snapshot),
    );
  });

export const uploadJourneyAnchorPhoto = async (
  journeyId: string,
  file: File,
  onProgress?: PhotoUploadProgressHandler,
): Promise<{ path: string; url: string }> => {
  const validationError =
    validateImageFile(file);

  if (validationError) {
    throw new Error(validationError);
  }

  const path = buildJourneyAnchorPhotoPath(
    journeyId,
    file.name,
  );

  const uploadResult =
    await uploadFileWithProgress(
      path,
      file,
      onProgress,
    );

  const url = await getDownloadURL(
    uploadResult.ref,
  );

  return {
    path,
    url,
  };
};

export const uploadEntryPhoto = async (
  userId: string,
  journeyId: string,
  entryId: string,
  file: File,
  onProgress?: PhotoUploadProgressHandler,
): Promise<{ path: string; url: string }> => {
  const validationError =
    validateImageFile(file);

  if (validationError) {
    throw new Error(validationError);
  }

  const path = buildEntryPhotoPath(
    userId,
    journeyId,
    entryId,
    file.name,
  );

  const uploadResult =
    await uploadFileWithProgress(
      path,
      file,
      onProgress,
    );

  const url = await getDownloadURL(
    uploadResult.ref,
  );

  return {
    path,
    url,
  };
};

export const deleteStorageFile = async (
  path: string,
): Promise<void> => {
  await deleteObject(ref(storage, path));
};
