import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('People Directory presentation contracts', () => {
  it('renders a separate list pane and selected profile pane', () => {
    const component = readRepoFile('src/features/people/PeopleDirectory.tsx');
    const styles = readRepoFile('src/features/people/people.css');

    expect(component).toContain('people-directory__list-panel');
    expect(component).toContain('people-directory__profile-panel');
    expect(styles).toContain('grid-template-columns: minmax(260px, .82fr) minmax(0, 1.45fr)');
  });

  it('replaces the list with the selected profile on mobile and provides a back action', () => {
    const component = readRepoFile('src/features/people/PeopleDirectory.tsx');
    const styles = readRepoFile('src/features/people/people.css');

    expect(component).toContain('Back to people');
    expect(styles).toContain('.people-directory__workspace.has-selection .people-directory__list-panel { display: none; }');
    expect(styles).toContain('.people-directory__workspace:not(.has-selection) .people-directory__profile-panel { display: none; }');
  });
});
