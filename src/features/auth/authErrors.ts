export const getAuthErrorMessage = (error: unknown): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Please choose a stronger password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a little while and try again.';
    default:
      return 'We could not complete that request. Please try again.';
  }
};
