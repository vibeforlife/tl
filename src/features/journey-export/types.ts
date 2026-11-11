import type { Entry, Journey } from '../../types/domain';

export type JourneyExportMode = 'summary' | 'comprehensive';

export interface JourneyExportInput {
  journey: Journey;
  entries: Entry[];
  mode: JourneyExportMode;
}
