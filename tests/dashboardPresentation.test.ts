import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('dashboard presentation contracts', () => {
  it('limits country and Journey previews to five with independent expand controls', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');

    expect(component).toContain('countryVisits.slice(0, 5)');
    expect(component).toContain('recentJourneys.slice(0, 5)');
    expect(component).toContain('visibleCountries.map((country)');
    expect(component).toContain('visibleJourneys.map((journey, index)');
    expect(component).toContain('showAllCountries');
    expect(component).toContain('showAllJourneys');
    expect(component).toContain('Show all ${countryVisits.length} countries');
    expect(component).toContain('Show all ${recentJourneys.length} Journeys');
  });

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

  it('opens a person quick view with recent Memories and a full-profile route', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');

    expect(component).toContain('td-person-popup');
    expect(component).toContain('selectedDashboardMemories');
    expect(component).toContain('onOpenMemory(entry)');
    expect(component).toContain('View full profile');
  });
});


describe('TL-004B dashboard presentation contracts', () => {
  it('shows the travel insights and labels mileage as an estimate', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');
    expect(component).toContain('Estimated distance travelled');
    expect(component).toContain('Continents visited');
    expect(component).toContain('Most visited country');
    expect(component).toContain('Longest Journey');
    expect(component).toContain('Straight-line great-circle estimate');
  });
  it('provides map reset and visible load-error UI', () => {
    const component = readRepoFile('src/features/dashboard/CountryVisitsMap.tsx');
    expect(component).toContain('Return to original map view');
    expect(component).toContain('td-country-map__error');
    expect(component).toContain('countryFeaturesRef.current');
    expect(component).not.toContain('querySourceFeatures');
    expect(component).toContain("map.on('error'");
  });

  it('validates the endpoint mode on Journey creation, not updates', () => {
    const rules = readRepoFile('firestore.rules');
    const createStart = rules.indexOf("allow create: if signedIn()\n        && request.resource.data.createdBy == request.auth.uid");
    const updateStart = rules.indexOf('allow update: if canEditJourney(journeyId)');
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(updateStart).toBeGreaterThanOrEqual(0);

    const createEnd = rules.indexOf(';', createStart);
    const updateEnd = rules.indexOf(';', updateStart);
    const createRule = rules.slice(createStart, createEnd);
    const updateRule = rules.slice(updateStart, updateEnd);

    expect(createRule).toContain("!('distanceEndpointMode' in request.resource.data)");
    expect(createRule).toContain("request.resource.data.distanceEndpointMode == 'explicit'");
    expect(updateRule).not.toContain('distanceEndpointMode');
  });
});


describe('Home dashboard section hierarchy', () => {
  it('keeps the dashboard sections in the agreed order', () => {
    const component = readRepoFile('src/features/dashboard/TravelDashboard.tsx');
    const positions = [
      component.indexOf('<div className="td-dashboard-actions"'),
      component.indexOf('<section className="td-insights"'),
      component.indexOf('<section className="td-journeys"'),
      component.indexOf('<section className="td-countries"'),
      component.indexOf('<section className="td-connections"'),
      component.indexOf('<section className="td-moments"'),
    ];
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(component).toContain('onCreateJourney');
  });
});
