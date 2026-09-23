import type {
  Entry,
  EntryCost,
  EntryLocation,
  EntryPhoto,
} from '../../types/domain';
import type { CreateEntryInput } from '../../services/firebase/entries';

const normalizeStringArray = (values: string[]) =>
  values.map((value) => value.trim()).filter(Boolean);

const locationsEqual = (
  left: EntryLocation | undefined,
  right: EntryLocation | undefined,
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    left.name === right.name &&
    left.address === right.address &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.mapboxPlaceId === right.mapboxPlaceId
  );
};

const photosEqual = (
  left: EntryPhoto | undefined,
  right: EntryPhoto | undefined,
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    left.url === right.url &&
    left.storagePath === right.storagePath &&
    left.caption === right.caption
  );
};

const costsEqual = (left: EntryCost[], right: EntryCost[]) => {
  if (left.length !== right.length) return false;

  return left.every((cost, index) => {
    const other = right[index];

    return (
      cost.category === other.category &&
      cost.amount === other.amount &&
      cost.currency === other.currency
    );
  });
};

export const isEntryDraftDirty = (
  entry: Entry,
  draft: CreateEntryInput,
  peopleText: string,
  tagsText: string,
  manualLocation: {
    name: string;
    address: string;
    latitude: string;
    longitude: string;
  },
  photoCaption: string,
  pendingPhotoFile: File | null,
  removeExistingPhoto: boolean,
) => {
  const draftPeople = normalizeStringArray(
    peopleText.split(','),
  );
  const draftTags = normalizeStringArray(
    tagsText.split(','),
  );

  const peopleChanged =
    JSON.stringify(draftPeople) !== JSON.stringify(entry.people);

  const tagsChanged =
    JSON.stringify(draftTags) !== JSON.stringify(entry.tags);

  const locationChanged =
    !locationsEqual(draft.location, entry.location) ||
    manualLocation.name.trim() !== (entry.location?.name ?? '') ||
    manualLocation.address.trim() !== (entry.location?.address ?? '') ||
    manualLocation.latitude.trim() !==
      (entry.location ? String(entry.location.latitude) : '') ||
    manualLocation.longitude.trim() !==
      (entry.location ? String(entry.location.longitude) : '');

  const photoChanged =
    pendingPhotoFile !== null ||
    removeExistingPhoto ||
    photoCaption.trim() !== (entry.photo?.caption ?? '') ||
    !photosEqual(
      draft.photo,
      removeExistingPhoto ? undefined : entry.photo,
    );

  return (
    draft.title !== entry.title ||
    draft.date !== entry.date ||
    draft.time !== (entry.time ?? '') ||
    draft.story !== entry.story ||
    draft.highlight !== (entry.highlight ?? '') ||
    draft.rating !== entry.rating ||
    draft.memoryType !== (entry.memoryType ?? '') ||
    peopleChanged ||
    tagsChanged ||
    locationChanged ||
    photoChanged ||
    !costsEqual(draft.costs, entry.costs)
  );
};
