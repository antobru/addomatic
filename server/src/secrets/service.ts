import { SecretsStore } from "./store.js";

let instance: SecretsService | null = null;

export class SecretsService {
  private store: SecretsStore;

  private constructor(store: SecretsStore) {
    this.store = store;
  }

  /** Returns value or throws if missing. Use for required secrets. */
  require(key: string): string {
    const value = this.store.get(key);
    if (value === undefined) {
      throw new Error(`Required secret "${key}" not found in secrets store.`);
    }
    return value;
  }

  /** Returns value or undefined. Use for optional secrets. */
  optional(key: string): string | undefined {
    return this.store.get(key);
  }

  /** Returns value from secrets store, falling back to env var if missing. */
  getWithEnvFallback(key: string, envVar: string): string | undefined {
    return this.store.get(key) ?? process.env[envVar];
  }

  /** Management — returns all key names, never values. */
  list(): string[] {
    return this.store.list();
  }

  /** Management — store or overwrite a secret. */
  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  /** Management — delete a secret. Returns false if not found. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  static init(masterKey: string): SecretsService {
    if (instance) return instance;
    instance = new SecretsService(new SecretsStore(masterKey));
    return instance;
  }

  static get(): SecretsService {
    if (!instance) {
      throw new Error(
        "SecretsService not initialized. Call SecretsService.init(masterKey) first.",
      );
    }
    return instance;
  }
}
