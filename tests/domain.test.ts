import { describe, expect, it } from 'vitest';
import type { JourneyRole } from '../src/types/domain';

const canEditJourney = (role: JourneyRole): boolean =>
  role === 'owner' || role === 'editor';

const canManageCollaborators = (role: JourneyRole): boolean => role === 'owner';

describe('Travel Lore V1 permission rules', () => {
  it('allows owners and editors to edit a journey', () => {
    expect(canEditJourney('owner')).toBe(true);
    expect(canEditJourney('editor')).toBe(true);
    expect(canEditJourney('viewer')).toBe(false);
  });

  it('allows only owners to manage collaborators', () => {
    expect(canManageCollaborators('owner')).toBe(true);
    expect(canManageCollaborators('editor')).toBe(false);
    expect(canManageCollaborators('viewer')).toBe(false);
  });
});
