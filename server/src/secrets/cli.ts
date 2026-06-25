#!/usr/bin/env node
/**
 * CLI for managing the encrypted secrets store.
 *
 * Usage:
 *   tsx src/secrets/cli.ts set <KEY> <VALUE>
 *   tsx src/secrets/cli.ts get <KEY>
 *   tsx src/secrets/cli.ts delete <KEY>
 *   tsx src/secrets/cli.ts list
 *   tsx src/secrets/cli.ts keygen   — prints a random master key
 *
 * Requires SECRETS_KEY env var (generate with: tsx src/secrets/cli.ts keygen)
 */
import { randomBytes } from "node:crypto";
import { SecretsStore } from "./store.js";

const [, , command, key, value] = process.argv;

function getStore(): SecretsStore {
  const masterKey = process.env["SECRETS_KEY"];
  if (!masterKey) {
    console.error("Error: SECRETS_KEY env var is required.");
    console.error("Generate one with: tsx src/secrets/cli.ts keygen");
    process.exit(1);
  }
  return new SecretsStore(masterKey);
}

switch (command) {
  case "keygen": {
    console.log(randomBytes(32).toString("hex"));
    break;
  }

  case "set": {
    if (!key || !value) {
      console.error("Usage: secrets set <KEY> <VALUE>");
      process.exit(1);
    }
    const store = getStore();
    store.set(key, value);
    console.log(`✓ Secret "${key}" saved.`);
    break;
  }

  case "get": {
    if (!key) {
      console.error("Usage: secrets get <KEY>");
      process.exit(1);
    }
    const store = getStore();
    const result = store.get(key);
    if (result === undefined) {
      console.error(`Secret "${key}" not found.`);
      process.exit(1);
    }
    console.log(result);
    break;
  }

  case "delete": {
    if (!key) {
      console.error("Usage: secrets delete <KEY>");
      process.exit(1);
    }
    const store = getStore();
    const deleted = store.delete(key);
    if (!deleted) {
      console.error(`Secret "${key}" not found.`);
      process.exit(1);
    }
    console.log(`✓ Secret "${key}" deleted.`);
    break;
  }

  case "list": {
    const store = getStore();
    const keys = store.list();
    if (keys.length === 0) {
      console.log("No secrets stored.");
    } else {
      keys.forEach((k) => console.log(k));
    }
    break;
  }

  default: {
    console.error(
      "Commands: keygen | set <KEY> <VALUE> | get <KEY> | delete <KEY> | list",
    );
    process.exit(1);
  }
}
