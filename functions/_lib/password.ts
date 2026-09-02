// The one password rule, shared by signup, reset and change-password.
// Mirrored on the client in src/views/SignIn.tsx (live checklist).
// Returns a user-facing message, or null when the password is acceptable.
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include lowercase, uppercase, and a number'
  }
  if (password.length > 200) return 'Password is too long'
  return null
}
