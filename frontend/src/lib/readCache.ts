type Entry = { promise: Promise<unknown>; expiresAt: number };

// Deliberately memory-only: never persist member data across browser sessions.
export class ReadCache {
  private entries = new Map<string, Entry>();

  clear() {
    this.entries.clear();
  }

  read<T>(key: string, lifetime: number, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > Date.now())
      return existing.promise.then((value) => structuredClone(value as T));

    const entry: Entry = {
      expiresAt: Infinity,
      promise: load().then(
        (value) => {
          if (this.entries.get(key) === entry)
            entry.expiresAt = Date.now() + lifetime;
          return value;
        },
        (error) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw error;
        },
      ),
    };
    this.entries.set(key, entry);
    return entry.promise.then((value) => structuredClone(value as T));
  }
}
