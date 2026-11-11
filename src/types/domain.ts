import type { Timestamp } from 'firebase/firestore';

export type JourneyRole = 'owner' | 'editor' | 'viewer';
export type InvitationRole = Exclude<JourneyRole, 'owner'>;

export interface JourneyPhoto {
  url: string;
  storagePath: string;
}

export interface Journey {
  id: string;
  name: string;
  place: string;
  startDate: string;
  endDate: string;
  anchorPhoto?: JourneyPhoto;
  googlePhotosUrl?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JourneyMember {
  uid: string;
  email: string;
  role: JourneyRole;
  joinedAt: Timestamp;
  invitationId?: string;
}

export interface EntryLocation {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  mapboxPlaceId?: string;
  /** Country context returned by the selected Mapbox Search Box feature. */
  countryName?: string;
  countryCode?: string;
  countrySource?: 'mapbox-search-box';
}

export type MemoryType =
  | 'place'
  | 'food'
  | 'sight'
  | 'event'
  | 'moment'
  | 'experience'
  | 'people'
  | 'other';

export type EntryCostCategory =
  | 'entrance'
  | 'ride'
  | 'food'
  | 'stay'
  | 'shopping'
  | 'other';

export interface EntryCost {
  category: EntryCostCategory;
  amount: number;
  currency: string;
}

export type EntryGeographyStatus = 'matched' | 'ambiguous' | 'near-boundary' | 'unmatched';

/** Cached country assignment derived from a Memory's saved coordinates. */
export interface EntryGeography {
  countryCode: string | null;
  countryName: string | null;
  status: EntryGeographyStatus;
  sourceLatitude: number;
  sourceLongitude: number;
  datasetVersion: string;
  algorithmVersion: string;
}

export interface EntryManualCountry {
  countryCode: string;
  countryName: string;
  source: 'manual';
  assignedBy: string;
  assignedAt: Timestamp;
}

/** A private profile owned by one Travel Lore account. */
export interface Person {
  id: string;
  ownerId: string;
  name: string;
  normalizedName?: string;
  aliases: string[];
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Safe, shared reference stored on a Memory; never contains private profile fields. */
export interface MemoryPerson {
  personId: string;
  ownerId: string;
  displayName: string;
}

export interface EntryPhoto {
  url: string;
  storagePath: string;
  caption?: string;
}

export interface Entry {
  id: string;
  journeyId: string;
  title: string;
  date: string;
  time?: string;
  story: string;
  highlight?: string;
  rating?: number;
  peopleRefs: MemoryPerson[];
  memoryType?: MemoryType;
  tags: string[];
  location?: EntryLocation;
  geography?: EntryGeography;
  manualCountry?: EntryManualCountry;
  photo?: EntryPhoto;
  costs: EntryCost[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Invitation {
  id: string;
  journeyId: string;
  inviterId: string;
  role: InvitationRole;
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
}
