import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import type { User } from 'firebase/auth';
import {
  createEntry,
  deleteEntry,
  updateEntry,
  validateEntryInput,
  type CreateEntryInput,
} from '../../services/firebase/entries';
import {
  deleteStorageFile,
  uploadEntryPhoto,
  validateImageFile,
} from '../../services/firebase/storage';
import { optimizeImageFile } from '../../services/firebase/imageOptimization';
import type {
  Entry,
  EntryCost,
  EntryLocation,
  EntryPhoto,
  MemoryType,
} from '../../types/domain';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const mapboxTheme = {
  variables: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    unit: '13px',
    padding: '10px',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '12px',
    boxShadow: '0 18px 42px rgba(0,0,0,.32)',
    colorText: '#f3f0e8',
    colorPrimary: '#40c7bd',
    colorSecondary: 'rgba(243,240,232,.48)',
    colorBackground: '#07141e',
    colorBackgroundHover: '#0d1b2a',
    colorBackgroundActive: '#102433',
  },
  cssText: `
    .SearchBox {
      width: 100%;
    }

    .Input {
      min-height: 48px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 12px;
      background: rgba(2,10,17,.62);
      color: #f3f0e8;
      box-shadow: none;
    }

    .Input {
      color: #f3f0e8 !important;
      --colorText: #f3f0e8;
    }

    .Input::placeholder {
      color: rgba(243,240,232,.38) !important;
      opacity: 1;
    }

    .Input:focus {
      border-color: rgba(64,199,189,.75);
      background: rgba(2,10,17,.82);
      box-shadow: 0 0 0 3px rgba(64,199,189,.1);
    }

    .Input::placeholder {
      color: rgba(243,240,232,.38);
    }

    .Results {
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 12px;
      background: #07141e;
      box-shadow: 0 18px 42px rgba(0,0,0,.32);
    }

    .Suggestion:hover {
      background: rgba(64,199,189,.08);
    }
  `,
};

const memoryTypes: Array<{ value: MemoryType; label: string }> = [
  { value: 'place', label: 'Place' },
  { value: 'food', label: 'Food' },
  { value: 'sight', label: 'Sight' },
  { value: 'event', label: 'Event' },
  { value: 'moment', label: 'Moment' },
  { value: 'experience', label: 'Experience' },
  { value: 'people', label: 'People' },
  { value: 'other', label: 'Other' },
];

const costCategories: Array<{ value: EntryCost['category']; label: string }> = [
  { value: 'entrance', label: 'Entrance' },
  { value: 'ride', label: 'Ride' },
  { value: 'food', label: 'Food' },
  { value: 'stay', label: 'Stay' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];

const blankCost = (): EntryCost => ({
  category: 'other',
  amount: 0,
  currency: 'CAD',
});

export function CreateEntryForm({
  user,
  journeyId,
  onCreated,
  entry,
  onUpdated,
  idPrefix = 'entry',
}: {
  user: User;
  journeyId: string;
  onCreated: () => Promise<void> | void;
  entry?: Entry;
  onUpdated?: () => Promise<void> | void;
  idPrefix?: string;
}) {
  const [form, setForm] = useState<CreateEntryInput>({
    title: '',
    date: '',
    time: '',
    story: '',
    highlight: '',
    rating: undefined,
    people: [],
    memoryType: '',
    tags: [],
    location: undefined,
    photo: undefined,
    costs: [],
  });

  const [peopleText, setPeopleText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null);
  const [photoProcessingState, setPhotoProcessingState] =
    useState<'idle' | 'processing' | 'ready'>('idle');
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [manualLocation, setManualLocation] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
  });
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);

  const isEditing = Boolean(entry);

  useEffect(() => {
    if (!pendingPhotoFile) {
      setPendingPhotoPreviewUrl(null);
      return;
    }

    const previewUrl =
      URL.createObjectURL(pendingPhotoFile);

    setPendingPhotoPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [pendingPhotoFile]);

  const fieldId = (name: string) => `${idPrefix}-${name}`;

  useEffect(() => {
    if (!entry) {
      setShowAdditionalDetails(false);
      return;
    }

    setShowAdditionalDetails(true);

    setForm({
      title: entry.title,
      date: entry.date,
      time: entry.time ?? '',
      story: entry.story,
      highlight: entry.highlight ?? '',
      rating: entry.rating,
      people: entry.people,
      memoryType: entry.memoryType ?? '',
      tags: entry.tags,
      location: entry.location,
      photo: entry.photo,
      costs: entry.costs,
    });

    setPeopleText(entry.people.join(', '));
    setTagsText(entry.tags.join(', '));
    setPendingPhotoFile(null);
    setPhotoProcessingState('idle');
    setPhotoUploadProgress(null);
    setPhotoCaption(entry.photo?.caption ?? '');
    setRemoveExistingPhoto(false);

    setManualLocation({
      name: entry.location?.name ?? '',
      address: entry.location?.address ?? '',
      latitude:
        entry.location?.latitude !== undefined
          ? String(entry.location.latitude)
          : '',
      longitude:
        entry.location?.longitude !== undefined
          ? String(entry.location.longitude)
          : '',
    });

    setShowManualLocation(Boolean(entry.location));
    setError(null);
  }, [entry]);

  const update = <K extends keyof CreateEntryInput>(
    field: K,
    value: CreateEntryInput[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const buildLocation = (): EntryLocation | undefined => {
    const hasManualLocation =
      manualLocation.name.trim() ||
      manualLocation.latitude.trim() ||
      manualLocation.longitude.trim();

    if (!hasManualLocation) {
      return form.location;
    }

    return {
      name: manualLocation.name.trim(),
      address: manualLocation.address.trim() || undefined,
      latitude: Number(manualLocation.latitude),
      longitude: Number(manualLocation.longitude),
      mapboxPlaceId: form.location?.mapboxPlaceId,
    };
  };

  const handleMapboxRetrieve = (response: Parameters<NonNullable<React.ComponentProps<typeof SearchBox>['onRetrieve']>>[0]) => {
    const feature = response.features[0];

    if (!feature) return;

    const coordinates = feature.geometry.coordinates;

    setForm((current) => ({
      ...current,
      location: {
        name: feature.properties.name || 'Selected location',
        address: feature.properties.full_address || feature.properties.place_formatted || undefined,
        latitude: coordinates[1],
        longitude: coordinates[0],
        mapboxPlaceId: feature.properties.mapbox_id,
      },
    }));

    setManualLocation({
      name: feature.properties.name || 'Selected location',
      address: feature.properties.full_address || feature.properties.place_formatted || '',
      latitude: String(coordinates[1]),
      longitude: String(coordinates[0]),
    });

    setShowManualLocation(true);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    const people = peopleText
      .split(',')
      .map((person) => person.trim())
      .filter(Boolean);

    const tags = tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const location = buildLocation();

    const nextForm: CreateEntryInput = {
      ...form,
      people,
      tags,
      location,
    };

    const validationError = validateEntryInput({
      ...nextForm,
      photo:
        entry && !pendingPhotoFile && !removeExistingPhoto
          ? nextForm.photo
          : undefined,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (entry) {
        const oldPhoto = entry.photo;
        let uploadedPhoto: EntryPhoto | undefined;

        if (pendingPhotoFile) {
          const uploaded = await uploadEntryPhoto(
            user.uid,
            journeyId,
            entry.id,
            pendingPhotoFile,
            (progress) => setPhotoUploadProgress(progress),
          );

          uploadedPhoto = {
            url: uploaded.url,
            storagePath: uploaded.path,
            ...(photoCaption.trim()
              ? { caption: photoCaption.trim() }
              : {}),
          };
        }

        const photoForSave = pendingPhotoFile
          ? uploadedPhoto
          : removeExistingPhoto
            ? undefined
            : nextForm.photo
              ? {
                  ...nextForm.photo,
                  ...(photoCaption.trim()
                    ? { caption: photoCaption.trim() }
                    : { caption: undefined }),
                }
              : undefined;

        try {
          await updateEntry(journeyId, entry.id, {
            ...nextForm,
            photo: photoForSave,
          });
        } catch (updateError) {
          if (uploadedPhoto) {
            try {
              await deleteStorageFile(uploadedPhoto.storagePath);
            } catch {
              console.warn('Could not clean up the newly uploaded photo.', updateError);
            }
          }
          throw updateError;
        }

        if (
          oldPhoto &&
          ((pendingPhotoFile && uploadedPhoto) || removeExistingPhoto) &&
          oldPhoto.storagePath !== uploadedPhoto?.storagePath
        ) {
          try {
            await deleteStorageFile(oldPhoto.storagePath);
          } catch {
            console.warn('Memory updated, but the previous photo could not be removed.');
          }
        }

        await onUpdated?.();
      } else {
        const entryId = await createEntry(user.uid, journeyId, {
          ...nextForm,
          photo: undefined,
        });

        if (pendingPhotoFile) {
          let uploadedPhoto: EntryPhoto | undefined;

          try {
            const uploaded = await uploadEntryPhoto(
              user.uid,
              journeyId,
              entryId,
              pendingPhotoFile,
              (progress) => setPhotoUploadProgress(progress),
            );

            uploadedPhoto = {
              url: uploaded.url,
              storagePath: uploaded.path,
              ...(photoCaption.trim()
                ? { caption: photoCaption.trim() }
                : {}),
            };

            await updateEntry(journeyId, entryId, {
              ...nextForm,
              photo: uploadedPhoto,
            });
          } catch (photoError) {
            if (uploadedPhoto) {
              try {
                await deleteStorageFile(uploadedPhoto.storagePath);
              } catch {
                console.warn('Could not clean up the uploaded photo after save failure.');
              }
            }

            try {
              await deleteEntry(journeyId, entryId);
            } catch {
              console.warn('Could not clean up the newly created memory after save failure.');
            }

            throw photoError;
          }
        }

        setForm({
          title: '',
          date: '',
          time: '',
          story: '',
          highlight: '',
          rating: undefined,
          people: [],
          memoryType: '',
          tags: [],
          location: undefined,
          photo: undefined,
          costs: [],
        });
        setPeopleText('');
        setTagsText('');
        setPendingPhotoFile(null);
        setPhotoProcessingState('idle');
        setPhotoUploadProgress(null);
        setPhotoCaption('');
        setRemoveExistingPhoto(false);
        setManualLocation({
          name: '',
          address: '',
          latitude: '',
          longitude: '',
        });
        setShowManualLocation(false);
        setShowAdditionalDetails(false);

        await onCreated();
      }
    } catch (entryError) {
      setError(
        entryError instanceof Error
          ? entryError.message
          : isEditing
            ? 'We could not update this memory. Please try again.'
            : 'We could not save this entry. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCost = (
    index: number,
    field: keyof EntryCost,
    value: string | number,
  ) => {
    setForm((current) => ({
      ...current,
      costs: current.costs.map((cost, costIndex) =>
        costIndex === index ? { ...cost, [field]: value } : cost,
      ),
    }));
  };

  const handlePhotoChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) return;

    const validationError =
      validateImageFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setPendingPhotoFile(null);
    setPendingPhotoPreviewUrl(null);
    setPhotoProcessingState('processing');
    setPhotoUploadProgress(null);
    setRemoveExistingPhoto(false);
    setError(null);

    try {
      const optimizedFile =
        await optimizeImageFile(file);

      setPendingPhotoFile(optimizedFile);
      setPhotoProcessingState('ready');
    } catch (photoError) {
      setPhotoProcessingState('idle');

      setError(
        photoError instanceof Error
          ? photoError.message
          : 'We could not prepare that photo for upload.',
      );
    }
  };

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className="entry-form__heading">
        <p className="eyebrow">{isEditing ? 'EDIT MEMORY' : 'NEW MEMORY'}</p>
        <h2>{isEditing ? 'Refine the moment.' : 'Capture the moment.'}</h2>
        <p>
          {isEditing
            ? 'Update the details you want to remember later.'
            : "Record the details you'll want to remember later."}
        </p>
      </div>

      <div className="entry-section entry-section--primary">
        <label htmlFor={fieldId("title")}>Title *</label>
        <input
          id={fieldId("title")}
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="Sunset in Oia"
          required
          disabled={isSubmitting}
        />

        <div className="date-grid date-grid--single">
          <div>
            <label htmlFor={fieldId("date")}>Date *</label>
            <input
              id={fieldId("date")}
              type="date"
              value={form.date}
              onChange={(event) => update('date', event.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        <label htmlFor={fieldId("story")}>Story *</label>
        <textarea
          id={fieldId("story")}
          value={form.story}
          onChange={(event) => update('story', event.target.value)}
          placeholder="What happened? What made this moment worth remembering?"
          rows={7}
          required
          disabled={isSubmitting}
        />

        <button
          type="button"
          className="secondary-button entry-details-toggle"
          onClick={() => setShowAdditionalDetails((current) => !current)}
          disabled={isSubmitting}
          aria-expanded={showAdditionalDetails}
        >
          {showAdditionalDetails ? '− Hide additional details' : '+ Add more details'}
        </button>

        {showAdditionalDetails && (
          <div className="entry-details">
            <div className="date-grid">
              <div>
                <label htmlFor={fieldId("time")}>Time</label>
                <input
                  id={fieldId("time")}
                  type="time"
                  value={form.time}
                  onChange={(event) => update('time', event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <label htmlFor={fieldId("highlight")}>Highlight</label>
            <input
              id={fieldId("highlight")}
              value={form.highlight}
              onChange={(event) => update('highlight', event.target.value)}
              placeholder="The best sunset of the entire trip."
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>

      {showAdditionalDetails && (
        <div className="entry-details entry-details--sections">
      <div className="entry-section">
        <div className="entry-section__title">
          <span>Rating</span>
          <span className="field-hint">How I'd remember it</span>
        </div>

        <div className="rating-picker" aria-label="Rating from 1 to 5 stars">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              className={form.rating && form.rating >= rating ? 'rating-star rating-star--active' : 'rating-star'}
              onClick={() => update('rating', form.rating === rating ? undefined : rating)}
              disabled={isSubmitting}
              aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
              aria-pressed={form.rating === rating}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="entry-section">
        <label htmlFor={fieldId("memory-type")}>Memory type</label>
        <select
          id={fieldId("memory-type")}
          value={form.memoryType}
          onChange={(event) => update('memoryType', event.target.value as MemoryType | '')}
          disabled={isSubmitting}
        >
          <option value="">Choose a type</option>
          {memoryTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <label htmlFor={fieldId("people")}>People I was with</label>
        <input
          id={fieldId("people")}
          value={peopleText}
          onChange={(event) => setPeopleText(event.target.value)}
          placeholder="Sarah, Ahmed, Mom"
          disabled={isSubmitting}
        />
        <p className="field-hint">Separate names with commas.</p>

        <label htmlFor={fieldId("tags")}>Tags</label>
        <input
          id={fieldId("tags")}
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          placeholder="sunset, family, food"
          disabled={isSubmitting}
        />
        <p className="field-hint">Separate tags with commas.</p>
      </div>

      <div className="entry-section">
        <div className="entry-section__title">
          <span>Location</span>
          <span className="field-hint">Optional</span>
        </div>

        {MAPBOX_TOKEN ? (
          <>
            <SearchBox
              accessToken={MAPBOX_TOKEN}
              value={form.location?.name || ''}
              onChange={(value) => {
                if (!value) {
                  setForm((current) => ({ ...current, location: undefined }));
                }
              }}
              onRetrieve={handleMapboxRetrieve}
              placeholder="Search for a place or address"
              options={{ language: 'en' }}
              componentOptions={{ allowReverse: true }}
              theme={mapboxTheme}
            />

            <p className="field-hint">
              Search a place, landmark, address, or coordinates.
            </p>
          </>
        ) : (
          <p className="location-notice">
            Mapbox search will be available once a Mapbox access token is configured.
            You can still enter coordinates manually.
          </p>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowManualLocation((current) => !current)}
          disabled={isSubmitting}
        >
          {showManualLocation ? 'Hide coordinate details' : 'Enter location details manually'}
        </button>

        {showManualLocation && (
          <div className="location-grid">
            <div>
              <label htmlFor="location-name">Place name</label>
              <input
                id="location-name"
                value={manualLocation.name}
                onChange={(event) =>
                  setManualLocation((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Oia, Santorini"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="location-address">Address</label>
              <input
                id="location-address"
                value={manualLocation.address}
                onChange={(event) =>
                  setManualLocation((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                placeholder="Optional address"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="location-latitude">Latitude</label>
              <input
                id="location-latitude"
                type="number"
                step="any"
                value={manualLocation.latitude}
                onChange={(event) =>
                  setManualLocation((current) => ({
                    ...current,
                    latitude: event.target.value,
                  }))
                }
                placeholder="36.4618"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="location-longitude">Longitude</label>
              <input
                id="location-longitude"
                type="number"
                step="any"
                value={manualLocation.longitude}
                onChange={(event) =>
                  setManualLocation((current) => ({
                    ...current,
                    longitude: event.target.value,
                  }))
                }
                placeholder="25.3753"
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}
      </div>

      <div className="entry-section">
        <div className="entry-section__title">
          <span>Costs</span>
          <span className="field-hint">Optional</span>
        </div>

        {form.costs.map((cost, index) => (
          <div className="cost-row" key={`${index}-${cost.category}`}>
            <select
              value={cost.category}
              onChange={(event) =>
                updateCost(index, 'category', event.target.value)
              }
              disabled={isSubmitting}
              aria-label="Cost category"
            >
              {costCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              step="0.01"
              value={cost.amount || ''}
              onChange={(event) =>
                updateCost(index, 'amount', Number(event.target.value))
              }
              placeholder="0.00"
              disabled={isSubmitting}
              aria-label="Cost amount"
            />

            <input
              value={cost.currency}
              onChange={(event) =>
                updateCost(index, 'currency', event.target.value.toUpperCase().slice(0, 3))
              }
              placeholder="CAD"
              maxLength={3}
              disabled={isSubmitting}
              aria-label="Currency"
            />

            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  costs: current.costs.filter((_, costIndex) => costIndex !== index),
                }))
              }
              disabled={isSubmitting}
              aria-label="Remove cost"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setForm((current) => ({
              ...current,
              costs: [...current.costs, blankCost()],
            }))
          }
          disabled={isSubmitting}
        >
          + Add cost
        </button>
      </div>

      <div className="entry-section entry-section--photo">
        <div className="entry-section__title">
          <span>Anchor Photo</span>
          <span className="field-hint">One representative photo for this memory</span>
        </div>

        {entry?.photo && !pendingPhotoFile && !removeExistingPhoto && (
          <div className="photo-preview">
            <a
              className="photo-preview__image-link"
              href={entry.photo.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open current anchor photo"
            >
              <img
                className="photo-preview__image"
                src={entry.photo.url}
                alt={entry.photo.caption || 'Current anchor photo'}
              />
            </a>
            <div className="photo-preview__details">
              <span className="photo-preview__label">Current photo</span>
              {entry.photo.caption && (
                <span className="photo-preview__caption">{entry.photo.caption}</span>
              )}
              <button
                type="button"
                className="photo-remove-button"
                onClick={() => {
                  setRemoveExistingPhoto(true);
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Remove photo
              </button>
            </div>
          </div>
        )}

        {pendingPhotoFile && (
          <div className="photo-preview">
            <div className="photo-preview__image-link">
              {pendingPhotoPreviewUrl ? (
                <img
                  className="photo-preview__image"
                  src={pendingPhotoPreviewUrl}
                  alt="Selected anchor photo preview"
                />
              ) : (
                <div className="photo-preview__fallback">Preparing photo…</div>
              )}
            </div>
            <div className="photo-preview__details">
              <span className="photo-preview__label">New anchor photo</span>
              <span className="photo-preview__filename">{pendingPhotoFile.name}</span>
              <button
                type="button"
                className="photo-remove-button"
                onClick={() => {
                  setPendingPhotoFile(null);
                  setPhotoProcessingState('idle');
                  setPhotoUploadProgress(null);
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Remove selection
              </button>
            </div>
          </div>
        )}

        {removeExistingPhoto && !pendingPhotoFile && (
          <div className="photo-removal-notice">
            <span>The current anchor photo will be removed when you save.</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setRemoveExistingPhoto(false);
                setError(null);
              }}
              disabled={isSubmitting}
            >
              Keep photo
            </button>
          </div>
        )}

        {(pendingPhotoFile || entry?.photo) && !removeExistingPhoto && (
          <>
            <label htmlFor={fieldId('photo-caption')}>Caption</label>
            <input
              id={fieldId('photo-caption')}
              value={photoCaption}
              onChange={(event) => {
                setPhotoCaption(event.target.value);
                setError(null);
              }}
              placeholder="Optional caption"
              disabled={isSubmitting}
            />
          </>
        )}

        <div className="photo-upload">
          <input
            id={fieldId('photo-file')}
            className="photo-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handlePhotoChange}
            disabled={isSubmitting}
            aria-label="Choose anchor photo"
          />
          <label className="photo-upload-button" htmlFor={fieldId('photo-file')}>
            {pendingPhotoFile || entry?.photo ? 'Choose a different photo' : 'Upload anchor photo'}
          </label>
          <span className="field-hint">
            JPEG, PNG, WebP, HEIC, or HEIF. Photos are resized to a maximum 2560px dimension and optimized to about 3 MB before upload.
          </span>
        </div>
      </div>
        </div>
      )}

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="primary-button"
        type="submit"
        disabled={
          isSubmitting ||
          photoProcessingState === 'processing'
        }
      >
        {isSubmitting
          ? photoUploadProgress !== null
            ? `Uploading photo ${photoUploadProgress}%`
            : 'Saving memory…'
          : photoProcessingState === 'processing'
            ? 'Preparing photo…'
            : isEditing
              ? 'Save Changes'
              : 'Save Memory'}
      </button>
    </form>
  );
}
