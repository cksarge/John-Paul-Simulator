// Must match Supabase → Authentication → Policies (password requirements) and Email OTP length.
export const OTP_LENGTH = 6;
export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'A number', test: (p) => /[0-9]/.test(p) },
];
export function passwordProblems(p) { return PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.label); }
export function assertPassword(p) {
  const bad = passwordProblems(p);
  if (bad.length) throw new Error('Password needs: ' + bad.join(', ').toLowerCase() + '.');
}
