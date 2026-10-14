export function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

export function first<T>(items: T[], what: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`missing ${what}`);
  return item;
}

export function last<T>(items: T[], what: string): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error(`missing ${what}`);
  return item;
}
