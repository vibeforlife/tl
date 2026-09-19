import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  createJourney,
  updateJourneyAnchorPhoto,
  validateJourneyInput,
  type CreateJourneyInput,
} from '../../services/firebase/journeys';
import {
  deleteStorageFile,
  uploadJourneyAnchorPhoto,
} from '../../services/firebase/storage';

export function CreateJourneyForm({ user, onCreated }: { user: User; onCreated: () => Promise<void> | void }) {
  const [form, setForm] = useState<CreateJourneyInput>({ name: '', place: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anchorPhoto, setAnchorPhoto] = useState<File | null>(null);

  const update = (field: keyof CreateJourneyInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const handleAnchorPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAnchorPhoto(event.target.files?.[0] ?? null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validationError = validateJourneyInput(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const journeyId = await createJourney(user, form);

      let photoError: string | null = null;

      if (anchorPhoto) {
        try {
          const uploadedPhoto = await uploadJourneyAnchorPhoto(
            journeyId,
            anchorPhoto,
          );

          try {
            await updateJourneyAnchorPhoto(journeyId, {
              url: uploadedPhoto.url,
              storagePath: uploadedPhoto.path,
            });
          } catch (metadataError) {
            try {
              await deleteStorageFile(uploadedPhoto.path);
            } catch {
              // The Journey remains intact even if cleanup fails.
            }

            throw metadataError;
          }
        } catch (photoUploadError) {
          photoError =
            photoUploadError instanceof Error
              ? `Journey created, but the anchor photo could not be uploaded: ${photoUploadError.message}`
              : 'Journey created, but the anchor photo could not be uploaded. You can add it later.';
        }
      }

      setForm({ name: '', place: '', startDate: '', endDate: '' });
      setAnchorPhoto(null);
      await onCreated();

      if (photoError) {
        setError(photoError);
      }
    } catch (journeyError) {
      setError(
        journeyError instanceof Error
          ? journeyError.message
          : 'We could not create that journey. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="journey-form" onSubmit={handleSubmit} noValidate>
      <div className="journey-form__heading">
        <p className="eyebrow">NEW JOURNEY</p>
        <h2 id="new-journey-title">Create a journey.</h2>
        <p className="journey-form__copy">
          Start a new adventure and document the places, moments, and memories along the way.
        </p>
      </div>

      <div className="journey-form__fields">
        <div className="journey-form__field">
          <label htmlFor="journey-name">Journey name</label>
          <input
            id="journey-name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            disabled={isSubmitting}
            placeholder="e.g. Italy 2026"
          />
        </div>

        <div className="journey-form__field">
          <label htmlFor="journey-place">Place</label>
          <input
            id="journey-place"
            value={form.place}
            onChange={(e) => update('place', e.target.value)}
            required
            disabled={isSubmitting}
            placeholder="e.g. Italy"
          />
        </div>

        <div className="date-grid">
          <div>
            <label htmlFor="journey-start">Start date</label>
            <input
              id="journey-start"
              type="date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="journey-end">End date</label>
            <input
              id="journey-end"
              type="date"
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={form.startDate || undefined}
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="journey-form__field">
          <label htmlFor="journey-anchor-photo">
            Anchor photo (optional)
          </label>

          <div className="journey-form__photo-picker">
            <input
              className="journey-form__file-input"
              id="journey-anchor-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleAnchorPhotoChange}
              disabled={isSubmitting}
            />

            <label
              className={[
                'journey-form__file-button',
                isSubmitting ? 'journey-form__file-button--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              htmlFor="journey-anchor-photo"
            >
              Choose file
            </label>

            <span
              className="journey-form__file-name"
              title={anchorPhoto?.name ?? 'No file chosen'}
            >
              {anchorPhoto?.name ?? 'No file chosen'}
            </span>
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button journey-form__submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating journey…' : 'Create Journey'}
        </button>
      </div>
    </form>

  );
}
