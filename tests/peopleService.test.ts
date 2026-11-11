import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TIMESTAMP__'),
  deleteField: vi.fn(() => '__DELETE_FIELD__'),
  listMyJourneys: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  deleteField: mocks.deleteField,
}));

vi.mock('../src/services/firebase/firestore', () => ({
  db: { __testDb: true },
}));

vi.mock('../src/services/firebase/journeys', () => ({
  listMyJourneys: mocks.listMyJourneys,
}));

import {
  deletePersonProfile,
  updatePersonProfile,
} from '../src/services/firebase/people';

type DocData = Record<string, unknown>;
type MockDoc = { id: string; ref: { path: string }; data: () => DocData };

const makeDoc = (id: string, data: DocData): MockDoc => ({
  id,
  ref: { path: `mock/${id}` },
  data: () => data,
});

const snapshot = (docs: MockDoc[]) => ({ docs });

const profile = (ownerId = 'user-1') => ({
  ownerId,
  name: 'Old Name',
  normalizedName: 'old name',
  aliases: [],
});

const makeTransactionHarness = (records: Record<string, DocData | null>) => {
  const updates: Array<{ path: string; data: DocData }> = [];
  const deletes: string[] = [];
  const sets: Array<{ path: string; data: DocData }> = [];

  const transaction = {
    get: vi.fn(async (ref: { path: string }) => {
      const value = records[ref.path];
      return {
        exists: () => value !== undefined && value !== null,
        data: () => value ?? {},
      };
    }),
    update: vi.fn((ref: { path: string }, data: DocData) => {
      updates.push({ path: ref.path, data });
      records[ref.path] = { ...(records[ref.path] ?? {}), ...data };
    }),
    delete: vi.fn((ref: { path: string }) => {
      deletes.push(ref.path);
      records[ref.path] = null;
    }),
    set: vi.fn((ref: { path: string }, data: DocData) => {
      sets.push({ path: ref.path, data });
      records[ref.path] = data;
    }),
  };

  mocks.runTransaction.mockImplementation(async (_db: unknown, callback: (tx: typeof transaction) => unknown) =>
    callback(transaction),
  );

  return { records, transaction, updates, deletes, sets };
};

describe('People Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMyJourneys.mockResolvedValue([{ id: 'journey-1' }]);
  });

  describe('updatePersonProfile', () => {
    it('updates the profile and propagates the renamed displayName to matching memory references only', async () => {
      const records: Record<string, DocData | null> = {
        'users/user-1/people/person-1': profile(),
        'journeys/journey-1/entries/entry-1': {
          peopleRefs: [
            { ownerId: 'user-1', personId: 'person-1', displayName: 'Old Name' },
            { ownerId: 'user-1', personId: 'person-2', displayName: 'Someone Else' },
            { ownerId: 'user-2', personId: 'person-1', displayName: 'Another Owner' },
          ],
        },
      };
      const harness = makeTransactionHarness(records);
      mocks.getDocs.mockImplementation(async (ref: { path: string }) => {
        if (ref.path === 'users/user-1/people') {
          return snapshot([makeDoc('person-1', profile())]);
        }
        if (ref.path === 'journeys/journey-1/entries') {
          return snapshot([makeDoc('entry-1', records['journeys/journey-1/entries/entry-1'] ?? {})]);
        }
        throw new Error(`Unexpected getDocs path: ${ref.path}`);
      });

      await updatePersonProfile('user-1', 'person-1', {
        name: '  New   Name ',
        aliases: [' Old Alias ', 'New Name', 'old alias'],
      });

      expect(harness.updates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: 'users/user-1/people/person-1',
          data: expect.objectContaining({
            name: 'New Name',
            normalizedName: 'new name',
            aliases: ['Old Alias'],
          }),
        }),
        expect.objectContaining({
          path: 'journeys/journey-1/entries/entry-1',
          data: expect.objectContaining({
            peopleRefs: [
              { ownerId: 'user-1', personId: 'person-1', displayName: 'New Name' },
              { ownerId: 'user-1', personId: 'person-2', displayName: 'Someone Else' },
              { ownerId: 'user-2', personId: 'person-1', displayName: 'Another Owner' },
            ],
          }),
        }),
      ]));
      expect(mocks.listMyJourneys).toHaveBeenCalledWith('user-1');
    });

    it('rejects a duplicate normalized name before writing anything', async () => {
      mocks.getDocs.mockResolvedValue(snapshot([
        makeDoc('person-1', profile()),
        makeDoc('person-2', {
          ownerId: 'user-1',
          name: 'Jane Doe',
          normalizedName: 'jane doe',
        }),
      ]));

      await expect(updatePersonProfile('user-1', 'person-1', {
        name: '  JANE   DOE ',
        aliases: [],
      })).rejects.toThrow('A person with this name already exists');

      expect(mocks.runTransaction).not.toHaveBeenCalled();
      expect(mocks.listMyJourneys).not.toHaveBeenCalled();
    });

    it('rejects an update when the target profile is not owned by the user', async () => {
      const harness = makeTransactionHarness({
        'users/user-1/people/person-1': profile('user-2'),
      });
      mocks.getDocs.mockResolvedValue(snapshot([
        makeDoc('person-1', profile('user-2')),
      ]));

      await expect(updatePersonProfile('user-1', 'person-1', {
        name: 'New Name',
        aliases: [],
      })).rejects.toThrow('This person profile could not be found.');

      expect(harness.updates).toHaveLength(0);
      expect(mocks.listMyJourneys).not.toHaveBeenCalled();
    });
  });

  describe('deletePersonProfile', () => {
    it('removes matching references before deleting the owned profile', async () => {
      const records: Record<string, DocData | null> = {
        'users/user-1/people/person-1': profile(),
        'journeys/journey-1/entries/entry-1': {
          peopleRefs: [
            { ownerId: 'user-1', personId: 'person-1', displayName: 'Old Name' },
            { ownerId: 'user-1', personId: 'person-2', displayName: 'Keep Me' },
            { ownerId: 'user-2', personId: 'person-1', displayName: 'Other Owner' },
          ],
        },
      };
      const harness = makeTransactionHarness(records);
      mocks.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => profile(),
      });
      mocks.getDocs.mockResolvedValue(snapshot([
        makeDoc('entry-1', records['journeys/journey-1/entries/entry-1'] ?? {}),
      ]));

      await deletePersonProfile('user-1', 'person-1');

      expect(harness.updates).toEqual([
        expect.objectContaining({
          path: 'journeys/journey-1/entries/entry-1',
          data: expect.objectContaining({
            peopleRefs: [
              { ownerId: 'user-1', personId: 'person-2', displayName: 'Keep Me' },
              { ownerId: 'user-2', personId: 'person-1', displayName: 'Other Owner' },
            ],
          }),
        }),
      ]);
      expect(harness.deletes).toContain('users/user-1/people/person-1');
    });

    it('retains the profile if association cleanup fails', async () => {
      const cleanupError = new Error('Firestore cleanup failed');
      mocks.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => profile(),
      });
      mocks.getDocs.mockResolvedValue(snapshot([
        makeDoc('entry-1', {
          peopleRefs: [{ ownerId: 'user-1', personId: 'person-1', displayName: 'Old Name' }],
        }),
      ]));
      mocks.runTransaction.mockRejectedValueOnce(cleanupError);

      await expect(deletePersonProfile('user-1', 'person-1')).rejects.toBe(cleanupError);
      // The profile-deletion transaction must not be reached after cleanup fails.
      expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    });

    it('does not delete a profile owned by another user', async () => {
      mocks.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => profile('user-2'),
      });

      await expect(deletePersonProfile('user-1', 'person-1'))
        .rejects.toThrow('This Person profile could not be found.');

      expect(mocks.listMyJourneys).not.toHaveBeenCalled();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
  });
});
