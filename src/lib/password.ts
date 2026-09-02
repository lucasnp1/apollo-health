// The password rule, mirrored from the server (functions/_lib/password.ts):
// 10+ characters with upper and lower case letters and a number.
export function passwordOk(password: string): boolean {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}
