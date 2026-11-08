import type { EntryLocation } from '../../types/domain';

export interface ResolvedLocationCoordinates {
  latitude: number;
  longitude: number;
  coordinatesUnchanged: boolean;
}

export const resolveLocationCoordinates = (
  manualLatitude: string,
  manualLongitude: string,
  existingLocation?: EntryLocation,
): ResolvedLocationCoordinates => {
  const latitude = manualLatitude.trim()
    ? Number(manualLatitude)
    : existingLocation?.latitude ?? Number.NaN;
  const longitude = manualLongitude.trim()
    ? Number(manualLongitude)
    : existingLocation?.longitude ?? Number.NaN;

  return {
    latitude,
    longitude,
    coordinatesUnchanged: Boolean(
      existingLocation &&
      latitude === existingLocation.latitude &&
      longitude === existingLocation.longitude
    ),
  };
};
