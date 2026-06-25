import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ALGO = "aes-256-gcm";
const SALT = "addomatic-secrets-v1";

const STORE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
  ".secrets",
);

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, SALT, 32);
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: data.toString("hex"),
  };
  return JSON.stringify(payload);
}

function decrypt(raw: string, key: Buffer): string {
  const { iv, tag, data } = JSON.parse(raw) as EncryptedPayload;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return (
    decipher.update(Buffer.from(data, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}

export class SecretsStore {
  private key: Buffer;
  private data: Record<string, string> = {};

  constructor(masterKey: string) {
    this.key = deriveKey(masterKey);
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, "utf8");
      this.data = JSON.parse(decrypt(raw, this.key));
    }
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set(key: string, value: string): void {
    this.data[key] = value;
    this.persist();
  }

  delete(key: string): boolean {
    if (!(key in this.data)) return false;
    delete this.data[key];
    this.persist();
    return true;
  }

  list(): string[] {
    return Object.keys(this.data);
  }

  private persist(): void {
    writeFileSync(STORE_PATH, encrypt(JSON.stringify(this.data), this.key));
  }
}
