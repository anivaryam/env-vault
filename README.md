# env-vault

Encrypted `.env` file manager. Seal your secrets into a vault that's safe to commit, powered by [random-universe-cipher](https://github.com/anivaryam/random-universe-cipher) (AEAD + Argon2id).

```
.env (plaintext, gitignored)  ←→  .env.vault (encrypted, committed)
```

## Features

- **Seal / Open** — encrypt `.env` files into `.vault` files and back
- **Authenticated encryption** — AEAD (encrypt-then-MAC) detects tampering and wrong passwords
- **Argon2id key derivation** — brute-force resistant password hashing
- **Single value access** — decrypt one key without exposing the whole file
- **Diff** — compare `.env` against its vault to find added, removed, or changed keys
- **CI-friendly** — password via `ENV_VAULT_KEY` environment variable, no interactive prompt
- **Cross-platform** — Linux, macOS, Windows (amd64/arm64)

## Install

**With brokit:**

```sh
brokit install env-vault
```

**From release binary (Linux/macOS):**

```sh
curl -sSL https://github.com/anivaryam/env-vault/releases/latest/download/env-vault_linux_amd64.tar.gz | tar xz
sudo mv env-vault /usr/local/bin/
```

**With npm:**

```sh
npm install -g env-vault
```

## Quick Start

```sh
# Encrypt your .env file (prompts for password)
env-vault seal .env

# Commit the vault
git add .env.vault
git commit -m "add encrypted env"

# On another machine / after cloning
env-vault open .env.vault
```

## CLI Usage

```
env-vault seal [file]                   Encrypt a .env file into a vault
env-vault open [file]                   Decrypt a vault file into .env
env-vault get <key> [file]              Get a single decrypted value
env-vault keys [file]                   List all keys in a vault (no values)
env-vault diff [env-file] [vault-file]  Compare keys between .env and its vault
```

### Flags

| Flag | Description |
|------|-------------|
| `-o, --out <path>` | Output file path (seal/open) |
| `-p, --password <password>` | Password (prefer `ENV_VAULT_KEY` or prompt) |
| `--values` | Show changed values in diff output |

### Password resolution

Password is resolved in this order:

1. `-p` / `--password` flag
2. `ENV_VAULT_KEY` environment variable
3. Interactive prompt (hidden input)

When sealing, the prompt asks for confirmation (enter password twice).

### Examples

```sh
# Seal with a custom output path
env-vault seal .env.production -o secrets/prod.vault

# Open to a specific file
env-vault open .env.vault -o .env.local

# Get a single value (pipe-friendly, outputs only the value)
env-vault get DATABASE_URL .env.vault

# Use in scripts
export DB_URL=$(env-vault get DATABASE_URL .env.vault -p "$SECRET")

# List all keys without exposing values
env-vault keys .env.vault

# Check what changed since last seal
env-vault diff .env .env.vault

# Show changed values (careful in shared terminals)
env-vault diff .env .env.vault --values
```

### CI / CD

Store one secret (`ENV_VAULT_KEY`) in your CI environment, then decrypt at build time:

```sh
ENV_VAULT_KEY=$SECRET env-vault open .env.vault
```

No interactive prompt. Add new variables by re-sealing and pushing — no CI config changes needed.

## Vault Format

```
#:env-vault:v1:ruc
<base64-encoded encrypted data>
```

The encrypted payload is: `salt (16 bytes) || nonce (16 bytes) || ciphertext || HMAC-SHA256 tag (32 bytes)`.

Encryption uses [random-universe-cipher](https://github.com/anivaryam/random-universe-cipher) in CTR mode with AEAD authentication. Key derivation uses Argon2id (64 MB memory, 2 iterations).

## Recommended .gitignore

```gitignore
# Plaintext secrets — never commit
.env
.env.local
.env.*.local

# Encrypted vaults — safe to commit
!*.vault
```

## How It Works

```
env-vault seal .env
      │
      ├── Read .env plaintext
      ├── Prompt for password
      ├── Argon2id(password, random salt) → 512-bit key
      ├── AEAD encrypt(plaintext, key) → nonce || ciphertext || tag
      ├── Bundle: salt || nonce || ciphertext || tag
      └── Base64 encode → .env.vault

env-vault open .env.vault
      │
      ├── Read and decode base64
      ├── Extract salt from first 16 bytes
      ├── Prompt for password
      ├── Argon2id(password, salt) → 512-bit key
      ├── AEAD decrypt(ciphertext, key) → verify tag, then decrypt
      └── Write plaintext → .env
```

Wrong password or tampered data → authentication fails → error, nothing written.

## License

MIT
