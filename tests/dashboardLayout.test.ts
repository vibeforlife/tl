import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(resolve(process.cwd(), 'src/features/dashboard/TravelDashboard.tsx'), 'utf8');

describe('Travel dashboard presentation', () => {
  it('renders dashboard sections in the agreed order', () => {
    const selectors = [
      'td-dashboard-actions',
      'td-insights',
      'td-journeys',
      'td-countries',
      'td-connections',
      'td-moments',
      'td-person-popup-backdrop',
      'td-footer',
    ];
    const positions = selectors.map((selector) => dashboard.indexOf(selector));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('renders the ten insight cards in the agreed order', () => {
    const labels = [
      'Countries visited',
      'Continents visited',
      'Estimated distance travelled',
      'Most visited country',
      'Longest Journey',
      'Number of Journeys',
      'Recorded places',
      'Recorded people',
      'Days covered by recorded Journeys',
      'Memories across your Journeys',
    ];
    const positions = labels.map((label) => dashboard.indexOf(`>${label}<`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect((dashboard.match(/className="td-insight"/g) ?? [])).toHaveLength(10);
  });

  it('shows miles and kilometres using the unrounded miles total for conversion', () => {
    expect(dashboard).toContain('Math.round(travelMileage.totalMiles).toLocaleString()} mi');
    expect(dashboard).toContain('Math.round(travelMileage.totalMiles * 1.609344).toLocaleString()} km');
  });
});
