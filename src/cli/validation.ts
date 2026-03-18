export function parsePositiveInt(value: string, name: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: "${value}" must be a positive integer`)
  }

  return parsed
}
