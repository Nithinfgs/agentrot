/** Rough token estimate (about 4 characters per token). Good enough for budgeting, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
