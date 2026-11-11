import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  'src/features/entries/CreateEntryForm.tsx',
  'utf8',
);

describe('CreateEntryForm layout contract', () => {
  it('shows the six primary fields in the agreed order before additional details', () => {
    const markers = [
      'fieldId("title")',
      'fieldId("date")',
      '<span>Location</span>',
      '<span>Anchor Photo</span>',
      'fieldId("people")',
      'fieldId("story")',
    ];

    const positions = markers.map((marker) => source.indexOf(marker));
    const togglePosition = source.indexOf(
      'className="secondary-button entry-details-toggle"',
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(togglePosition).toBeGreaterThan(positions[positions.length - 1]);
  });

  it('keeps Time and Highlight in the expandable details area', () => {
    const firstDetails = source.indexOf('{showAdditionalDetails && (');
    const secondDetails = source.indexOf(
      '{showAdditionalDetails && (',
      firstDetails + 1,
    );

    const timePosition = source.indexOf('fieldId("time")');
    const highlightPosition = source.indexOf('fieldId("highlight")');

    expect(firstDetails).toBeGreaterThan(-1);
    expect(secondDetails).toBeGreaterThan(firstDetails);
    expect(timePosition).toBeGreaterThan(firstDetails);
    expect(timePosition).toBeLessThan(secondDetails);
    expect(highlightPosition).toBeGreaterThan(firstDetails);
    expect(highlightPosition).toBeLessThan(secondDetails);
  });

  it('keeps Rating, Memory type, Tags, and Costs in expandable details', () => {
    const firstDetails = source.indexOf('{showAdditionalDetails && (');
    const secondDetails = source.indexOf(
      '{showAdditionalDetails && (',
      firstDetails + 1,
    );

    const markers = [
      '<span>Rating</span>',
      'fieldId("memory-type")',
      'fieldId("tags")',
      '<span>Costs</span>',
    ];
    const positions = markers.map((marker) => source.indexOf(marker));

    expect(secondDetails).toBeGreaterThan(firstDetails);
    expect(positions.every((position) => position > secondDetails)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('retains one Location section, one Anchor Photo section, and one People field', () => {
    expect(source.match(/<span>Location<\/span>/g)).toHaveLength(1);
    expect(source.match(/<span>Anchor Photo<\/span>/g)).toHaveLength(1);
    expect(source.match(/fieldId\("people"\)/g)).toHaveLength(2);
  });

  it('supports creating and selecting a person directly from the Memory form', () => {
    expect(source).toContain('createPersonProfile(user.uid, { name, aliases: [] })');
    expect(source).toContain('onCreatePerson={createPersonFromMemory}');
  });
});
