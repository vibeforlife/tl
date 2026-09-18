import type { Timestamp } from 'firebase/firestore';

export type JourneyRole = 'owner' | 'editor' | 'viewer';
export type InvitationRole = Exclude<JourneyRole, 'owner'>;

export interface Journey {
  id: string;
  name: string;
  place: string;
  startDate: string;
  endDate: string;
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
  people: string[];
  memoryType?: MemoryType;
  tags: string[];
  location?: EntryLocation;
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
