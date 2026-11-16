import { describe, expect, it } from 'vitest';
import { isReliveSoundtrackId } from '../src/domain/relive';
import {
  DEFAULT_RELIVE_SOUNDTRACK_ID,
  getReliveSoundtrack,
  RELIVE_SOUNDTRACKS,
} from '../src/features/relive/soundtracks';

describe('Relive soundtrack catalogue', () => {
  it('contains six unique tracks and a valid default', () => {
    expect(RELIVE_SOUNDTRACKS).toHaveLength(6);
    expect(new Set(RELIVE_SOUNDTRACKS.map((track) => track.id)).size).toBe(6);
    expect(RELIVE_SOUNDTRACKS.some((track) => track.id === DEFAULT_RELIVE_SOUNDTRACK_ID)).toBe(true);
  });

  it('recognizes only IDs in the built-in catalogue', () => {
    expect(isReliveSoundtrackId(DEFAULT_RELIVE_SOUNDTRACK_ID)).toBe(true);
    expect(isReliveSoundtrackId('removed-track')).toBe(false);
    expect(isReliveSoundtrackId(null)).toBe(false);
  });

  it('falls back to the default when an old or unknown track ID is stored', () => {
    expect(getReliveSoundtrack(undefined).id).toBe(DEFAULT_RELIVE_SOUNDTRACK_ID);
    expect(getReliveSoundtrack('removed-track').id).toBe(DEFAULT_RELIVE_SOUNDTRACK_ID);
  });

  it('provides a title, creator, mood and app-relative asset path for every track', () => {
    for (const track of RELIVE_SOUNDTRACKS) {
      expect(track.title.trim()).not.toBe('');
      expect(track.creator.trim()).not.toBe('');
      expect(track.mood.trim()).not.toBe('');
      expect(track.src).toContain('/relive-music/');
      expect(track.src.endsWith('.mp3')).toBe(true);
    }
  });
});
