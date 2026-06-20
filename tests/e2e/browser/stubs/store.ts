type StoreValue = string | number | boolean | null;

export async function load(_path: string, options?: { defaults?: Record<string, StoreValue> }) {
  const values = new Map<string, StoreValue>(Object.entries(options?.defaults ?? {}));
  return {
    async get<T>(key: string): Promise<T | null> {
      return (values.get(key) ?? null) as T | null;
    },
    async set(key: string, value: StoreValue): Promise<void> {
      values.set(key, value);
    },
    async save(): Promise<void> {},
  };
}
