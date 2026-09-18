export function rupeeInputValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : Number(value).toFixed(2);
}

export function parseRupees(value: unknown): number {
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error('Enter an amount in ? with at most two decimal places.');
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount > 90_071_992_547.4) throw new Error('The amount is too large.');
  return amount;
}
