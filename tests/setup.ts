const mockKv = {
  _data: new Map<string, unknown>(),

  async get(key: string[]) {
    const keyStr = JSON.stringify(key);
    return { value: this._data.get(keyStr) || null };
  },

  async set(key: string[], value: unknown) {
    const keyStr = JSON.stringify(key);
    this._data.set(keyStr, value);
  },

  async delete(key: string[]) {
    const keyStr = JSON.stringify(key);
    this._data.delete(keyStr);
  },

  async *list(options: { prefix: string[] }) {
    const prefixStr = JSON.stringify(options.prefix);
    for (const [keyStr, value] of this._data.entries()) {
      const key = JSON.parse(keyStr);
      if (JSON.stringify(key.slice(0, options.prefix.length)) === prefixStr) {
        yield { key, value };
      }
    }
  },

  close() {
    this._data.clear();
  },
};

global.Deno = {
  openKv: () => Promise.resolve(mockKv),
} as unknown as typeof Deno;
