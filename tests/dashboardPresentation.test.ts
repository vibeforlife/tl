import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('dashboard presentation contracts', () => {
  it('uses a two-column desktop layout when exactly two Journeys are present', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');
    const styles = readRepoFile('src/features/dashboard/dashboard.css');

    expect(component).toContain('journeys.length === 2');
    expect(styles).toContain('.td-journey-grid--two { grid-template-columns: repeat(2, minmax(0,1fr)); }');
    expect(styles).toContain('.td-journey-grid--two { grid-template-columns: 1fr; }');
  });

  it('allows Memory titles to wrap to two lines before truncating', () => {
    const styles = readRepoFile('src/features/dashboard/dashboard.css');

    expect(styles).toContain('-webkit-line-clamp: 2');
    expect(styles).toContain('-webkit-box-orient: vertical');
  });

  it('keeps the visual people preview limited while exposing every recorded name', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');

    expect(component).toContain('.slice(0, 24)');
    expect(component).toContain('allPeople.map((person)');
    expect(component).toContain('<details className="td-people-all">');
    expect(component).toContain('See all {namedPeople} names');
  });
});
