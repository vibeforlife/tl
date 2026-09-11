import { useEffect, useState, type FormEvent } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import type { User } from 'firebase/auth';
import {
  createEntry,
  updateEntry,
  validateEntryInput,
  type CreateEntryInput,
} from '../../services/firebase/entries';
import type {
  Entry,
  EntryCost,
  EntryLocation,
  EntryPhoto,
  MemoryType,
} from '../../types/domain';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

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

const blankCost = (): EntryCost => ({ category: 'other', amount: 0, currency: 'CAD' });
const blankPhoto = (): EntryPhoto => ({ url: '', caption: '' });

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
    title: '', date: '', time: '', story: '', highlight: '', rating: undefined,
    people: [], memoryType: '', tags: [], location: undefined, photo: undefined, costs: [],
  });
  const [peopleText, setPeopleText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [manualLocation, setManualLocation] = useState({ name: '', address: '', latitude: '', longitude: '' });
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const isEditing = Boolean(entry);
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  useEffect(() => {
    if (!entry) {
      setShowAdditionalDetails(false);
      return;
    }
    setShowAdditionalDetails(true);
    setForm({
      title: entry.title, date: entry.date, time: entry.time ?? '', story: entry.story,
      highlight: entry.highlight ?? '', rating: entry.rating, people: entry.people,
      memoryType: entry.memoryType ?? '', tags: entry.tags, location: entry.location,
      photo: entry.photo ?? undefined, costs: entry.costs,
    });
    setPeopleText(entry.people.join(', '));
    setTagsText(entry.tags.join(', '));
    setManualLocation({
      name: entry.location?.name ?? '', address: entry.location?.address ?? '',
      latitude: entry.location?.latitude !== undefined ? String(entry.location.latitude) : '',
      longitude: entry.location?.longitude !== undefined ? String(entry.location.longitude) : '',
    });
    setShowManualLocation(Boolean(entry.location));
    setError(null);
  }, [entry]);

  const update = <K extends keyof CreateEntryInput>(field: K, value: CreateEntryInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const buildLocation = (): EntryLocation | undefined => {
    const hasManualLocation = manualLocation.name.trim() || manualLocation.latitude.trim() || manualLocation.longitude.trim();
    if (!hasManualLocation) return form.location;
    return {
      name: manualLocation.name.trim(), address: manualLocation.address.trim() || undefined,
      latitude: Number(manualLocation.latitude), longitude: Number(manualLocation.longitude),
      mapboxPlaceId: form.location?.mapboxPlaceId,
    };
  };

  const handleMapboxRetrieve = (response: Parameters<NonNullable<React.ComponentProps<typeof SearchBox>['onRetrieve']>>[0]) => {
    const feature = response.features[0];
    if (!feature) return;
    const coordinates = feature.geometry.coordinates;
    setForm((current) => ({ ...current, location: {
      name: feature.properties.name || 'Selected location',
      address: feature.properties.full_address || feature.properties.place_formatted || undefined,
      latitude: coordinates[1], longitude: coordinates[0], mapboxPlaceId: feature.properties.mapbox_id,
    }}));
    setManualLocation({
      name: feature.properties.name || 'Selected location',
      address: feature.properties.full_address || feature.properties.place_formatted || '',
      latitude: String(coordinates[1]), longitude: String(coordinates[0]),
    });
    setShowManualLocation(true);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const people = peopleText.split(',').map((person) => person.trim()).filter(Boolean);
    const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
    const nextForm = { ...form, people, tags, location: buildLocation() };
    const validationError = validateEntryInput(nextForm);
    if (validationError) { setError(validationError); return; }
    setIsSubmitting(true);
    setError(null);
    try {
      if (entry) {
        await updateEntry(journeyId, entry.id, nextForm);
        await onUpdated?.();
      } else {
        await createEntry(user.uid, journeyId, nextForm);
        setForm({ title: '', date: '', time: '', story: '', highlight: '', rating: undefined, people: [], memoryType: '', tags: [], location: undefined, photo: undefined, costs: [] });
        setPeopleText(''); setTagsText('');
        setManualLocation({ name: '', address: '', latitude: '', longitude: '' });
        setShowManualLocation(false); setShowAdditionalDetails(false);
        await onCreated();
      }
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : isEditing ? 'We could not update this memory. Please try again.' : 'We could not save this entry. Please try again.');
    } finally { setIsSubmitting(false); }
  };

  const updateCost = (index: number, field: keyof EntryCost, value: string | number) => {
    setForm((current) => ({ ...current, costs: current.costs.map((cost, costIndex) => costIndex === index ? { ...cost, [field]: value } : cost) }));
  };

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className="entry-form__heading">
        <p className="eyebrow">{isEditing ? 'EDIT MEMORY' : 'NEW MEMORY'}</p>
        <h2>{isEditing ? 'Refine the moment.' : 'Capture the moment.'}</h2>
        <p>{isEditing ? 'Update the details you want to remember later.' : "Record the details you'll want to remember later."}</p>
      </div>

      <div className="entry-section entry-section--primary">
        <label htmlFor={fieldId('title')}>Title *</label>
        <input id={fieldId('title')} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Sunset in Oia" required disabled={isSubmitting} />
        <div className="date-grid date-grid--single"><div>
          <label htmlFor={fieldId('date')}>Date *</label>
          <input id={fieldId('date')} type="date" value={form.date} onChange={(event) => update('date', event.target.value)} required disabled={isSubmitting} />
        </div></div>
        <label htmlFor={fieldId('story')}>Story *</label>
        <textarea id={fieldId('story')} value={form.story} onChange={(event) => update('story', event.target.value)} placeholder="What happened? What made this moment worth remembering?" rows={7} required disabled={isSubmitting} />
        <button type="button" className="secondary-button entry-details-toggle" onClick={() => setShowAdditionalDetails((current) => !current)} disabled={isSubmitting} aria-expanded={showAdditionalDetails}>
          {showAdditionalDetails ? '− Hide additional details' : '+ Add more details'}
        </button>
        {showAdditionalDetails && <div className="entry-details">
          <div className="date-grid"><div>
            <label htmlFor={fieldId('time')}>Time</label>
            <input id={fieldId('time')} type="time" value={form.time} onChange={(event) => update('time', event.target.value)} disabled={isSubmitting} />
          </div></div>
          <label htmlFor={fieldId('highlight')}>Highlight</label>
          <input id={fieldId('highlight')} value={form.highlight} onChange={(event) => update('highlight', event.target.value)} placeholder="The best sunset of the entire trip." disabled={isSubmitting} />
        </div>}
      </div>

      {showAdditionalDetails && <div className="entry-details entry-details--sections">
        <div className="entry-section">
          <div className="entry-section__title"><span>Rating</span><span className="field-hint">How I'd remember it</span></div>
          <div className="rating-picker" aria-label="Rating from 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" className={form.rating && form.rating >= rating ? 'rating-star rating-star--active' : 'rating-star'} onClick={() => update('rating', form.rating === rating ? undefined : rating)} disabled={isSubmitting} aria-label={`${rating} star${rating === 1 ? '' : 's'}`} aria-pressed={form.rating === rating}>★</button>)}
          </div>
        </div>

        <div className="entry-section">
          <label htmlFor={fieldId('memory-type')}>Memory type</label>
          <select id={fieldId('memory-type')} value={form.memoryType} onChange={(event) => update('memoryType', event.target.value as MemoryType | '')} disabled={isSubmitting}>
            <option value="">Choose a type</option>
            {memoryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <label htmlFor={fieldId('people')}>People I was with</label>
          <input id={fieldId('people')} value={peopleText} onChange={(event) => setPeopleText(event.target.value)} placeholder="Sarah, Ahmed, Mom" disabled={isSubmitting} />
          <p className="field-hint">Separate names with commas.</p>
          <label htmlFor={fieldId('tags')}>Tags</label>
          <input id={fieldId('tags')} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="sunset, family, food" disabled={isSubmitting} />
          <p className="field-hint">Separate tags with commas.</p>
        </div>

        <div className="entry-section">
          <div className="entry-section__title"><span>Location</span><span className="field-hint">Optional</span></div>
          {MAPBOX_TOKEN ? <>
            <SearchBox accessToken={MAPBOX_TOKEN} value={form.location?.name || ''} onChange={(value) => { if (!value) setForm((current) => ({ ...current, location: undefined })); }} onRetrieve={handleMapboxRetrieve} placeholder="Search for a place or address" options={{ language: 'en' }} componentOptions={{ allowReverse: true }} />
            <p className="field-hint">Search a place, landmark, address, or coordinates.</p>
          </> : <p className="location-notice">Mapbox search will be available once a Mapbox access token is configured. You can still enter coordinates manually.</p>}
          <button type="button" className="secondary-button" onClick={() => setShowManualLocation((current) => !current)} disabled={isSubmitting}>{showManualLocation ? 'Hide coordinate details' : 'Enter location details manually'}</button>
          {showManualLocation && <div className="location-grid">
            <div><label htmlFor="location-name">Place name</label><input id="location-name" value={manualLocation.name} onChange={(event) => setManualLocation((current) => ({ ...current, name: event.target.value }))} placeholder="Oia, Santorini" disabled={isSubmitting} /></div>
            <div><label htmlFor="location-address">Address</label><input id="location-address" value={manualLocation.address} onChange={(event) => setManualLocation((current) => ({ ...current, address: event.target.value }))} placeholder="Optional address" disabled={isSubmitting} /></div>
            <div><label htmlFor="location-latitude">Latitude</label><input id="location-latitude" type="number" step="any" value={manualLocation.latitude} onChange={(event) => setManualLocation((current) => ({ ...current, latitude: event.target.value }))} placeholder="36.4618" disabled={isSubmitting} /></div>
            <div><label htmlFor="location-longitude">Longitude</label><input id="location-longitude" type="number" step="any" value={manualLocation.longitude} onChange={(event) => setManualLocation((current) => ({ ...current, longitude: event.target.value }))} placeholder="25.3753" disabled={isSubmitting} /></div>
          </div>}
        </div>

        <div className="entry-section">
          <div className="entry-section__title"><span>Costs</span><span className="field-hint">Optional</span></div>
          {form.costs.map((cost, index) => <div className="cost-row" key={`${index}-${cost.category}`}>
            <select value={cost.category} onChange={(event) => updateCost(index, 'category', event.target.value)} disabled={isSubmitting} aria-label="Cost category">{costCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>
            <input type="number" min="0" step="0.01" value={cost.amount || ''} onChange={(event) => updateCost(index, 'amount', Number(event.target.value))} placeholder="0.00" disabled={isSubmitting} aria-label="Cost amount" />
            <input value={cost.currency} onChange={(event) => updateCost(index, 'currency', event.target.value.toUpperCase().slice(0, 3))} placeholder="CAD" maxLength={3} disabled={isSubmitting} aria-label="Currency" />
            <button type="button" className="icon-button" onClick={() => setForm((current) => ({ ...current, costs: current.costs.filter((_, costIndex) => costIndex !== index) }))} disabled={isSubmitting} aria-label="Remove cost">×</button>
          </div>)}
          <button type="button" className="secondary-button" onClick={() => setForm((current) => ({ ...current, costs: [...current.costs, blankCost()] }))} disabled={isSubmitting}>+ Add cost</button>
        </div>

        <div className="entry-section">
          <div className="entry-section__title"><span>Anchor photo</span><span className="field-hint">One photo that defines this memory</span></div>
          <div className="photo-row">
            <input value={form.photo?.url || ''} onChange={(event) => update('photo', event.target.value ? { ...(form.photo || blankPhoto()), url: event.target.value } : undefined)} placeholder="https://…" disabled={isSubmitting} aria-label="Anchor photo link" />
            <input value={form.photo?.caption || ''} onChange={(event) => update('photo', { ...(form.photo || blankPhoto()), caption: event.target.value })} placeholder="Caption (optional)" disabled={isSubmitting} aria-label="Anchor photo caption" />
            {form.photo && <button type="button" className="icon-button" onClick={() => update('photo', undefined)} disabled={isSubmitting} aria-label="Remove anchor photo">×</button>}
          </div>
          <p className="field-hint">Use a direct image URL so Travel Lore can display the photo.</p>
        </div>
      </div>}

      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving memory…' : isEditing ? 'Save Changes' : 'Save Memory'}</button>
    </form>
  );
}
