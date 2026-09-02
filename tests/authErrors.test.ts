import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from '../src/features/auth/authErrors';

describe('authentication error messages', () => {
  it('maps common Firebase sign-in errors to user-friendly messages', () => {
    expect(
      getAuthErrorMessage({ code: 'auth/invalid-credential' }),
    ).toBe('The email or password is incorrect.');
  });

  it('does not expose raw Firebase errors for unknown failures', () => {
    expect(getAuthErrorMessage({ code: 'auth/internal-error', message: 'some internal Firebase detail' })).toBe(
      'We could not complete that request. Please try again.',
    );
  });
});
