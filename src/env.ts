export function requireEnv(value: string | undefined | null, name: string, hint?: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new Error(hint ? `${name} is required. ${hint}` : `${name} is required`);
  }
  return trimmed;
}
