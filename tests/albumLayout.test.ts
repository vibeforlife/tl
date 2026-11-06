import { describe, expect, it } from 'vitest';
import { buildJustifiedRows } from '../src/features/journeys/albumLayout';

describe('buildJustifiedRows', () => {
  it('keeps input order while grouping images into horizontal rows', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const rows = buildJustifiedRows(
      items,
      { a: 1.5, b: 1.5, c: 1.5, d: 1.5 },
      900,
      190,
      12,
    );

    expect(rows.flatMap((row) => row.items.map((item) => item.entry.id)))
      .toEqual(['a', 'b', 'c', 'd']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.height > 0)).toBe(true);
  });

  it('returns no rows when the container has no measurable width', () => {
    expect(buildJustifiedRows([{ id: 'a' }], {}, 0)).toEqual([]);
  });

  it('uses a safe fallback ratio for missing or invalid dimensions', () => {
    const rows = buildJustifiedRows(
      [{ id: 'a' }, { id: 'b' }],
      { a: 0, b: Number.NaN },
      800,
    );

    expect(rows.flatMap((row) => row.items).every((item) => item.width > 0))
      .toBe(true);
  });
});
