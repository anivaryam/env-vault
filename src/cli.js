import { program } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { seal, open, parseEnv } from './vault.js';
import { getPassword, confirmPassword } from './prompt.js';

export function run() {
  program
    .name('env-vault')
    .description('Encrypted .env file manager powered by random-universe-cipher')
    .version('0.1.0');

  // ── seal ─────────────────────────────────────────────────────────
  program
    .command('seal')
    .description('Encrypt a .env file into a vault')
    .argument('[file]', '.env file to encrypt', '.env')
    .option('-o, --out <path>', 'Output vault path')
    .option('-p, --password <password>', 'Password (prefer ENV_VAULT_KEY or prompt)')
    .action(async (file, opts) => {
      const envPath = resolve(file);

      if (!existsSync(envPath)) {
        console.error(`Error: ${file} not found`);
        process.exit(1);
      }

      const content = await readFile(envPath, 'utf8');
      const outPath = opts.out ? resolve(opts.out) : envPath + '.vault';
      const password = opts.password || await confirmPassword();

      try {
        process.stderr.write('Encrypting...');
        const vault = await seal(content, password);
        await writeFile(outPath, vault, 'utf8');
        process.stderr.write('\r');
        const outName = outPath.split('/').pop();
        console.log(`Sealed ${file} -> ${outName}`);
      } catch (err) {
        console.error(`\nError: ${err.message}`);
        process.exit(1);
      }
    });

  // ── open ─────────────────────────────────────────────────────────
  program
    .command('open')
    .description('Decrypt a vault file into .env')
    .argument('[file]', 'Vault file to decrypt', '.env.vault')
    .option('-o, --out <path>', 'Output .env path')
    .option('-p, --password <password>', 'Password')
    .action(async (file, opts) => {
      const vaultPath = resolve(file);

      if (!existsSync(vaultPath)) {
        console.error(`Error: ${file} not found`);
        process.exit(1);
      }

      const content = await readFile(vaultPath, 'utf8');

      const defaultOut = file.endsWith('.vault')
        ? file.slice(0, -6)
        : '.env';
      const outPath = opts.out ? resolve(opts.out) : resolve(defaultOut);
      const password = opts.password || await getPassword();

      try {
        process.stderr.write('Decrypting...');
        const decrypted = await open(content, password);
        await writeFile(outPath, decrypted, 'utf8');
        process.stderr.write('\r');
        const outName = outPath.split('/').pop();
        console.log(`Opened ${file} -> ${outName}`);
      } catch (err) {
        if (err.message.includes('Authentication failed')) {
          console.error('\nError: Wrong password or corrupted vault');
        } else {
          console.error(`\nError: ${err.message}`);
        }
        process.exit(1);
      }
    });

  // ── get ──────────────────────────────────────────────────────────
  program
    .command('get')
    .description('Get a single decrypted value from a vault')
    .argument('<key>', 'Environment variable name')
    .argument('[file]', 'Vault file', '.env.vault')
    .option('-p, --password <password>', 'Password')
    .action(async (key, file, opts) => {
      const vaultPath = resolve(file);

      if (!existsSync(vaultPath)) {
        console.error(`Error: ${file} not found`);
        process.exit(1);
      }

      const content = await readFile(vaultPath, 'utf8');
      const password = opts.password || await getPassword();

      try {
        const decrypted = await open(content, password);
        const vars = parseEnv(decrypted);

        if (key in vars) {
          process.stdout.write(vars[key]);
        } else {
          console.error(`Error: Key "${key}" not found in vault`);
          process.exit(1);
        }
      } catch (err) {
        if (err.message.includes('Authentication failed')) {
          console.error('Error: Wrong password or corrupted vault');
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
    });

  // ── diff ─────────────────────────────────────────────────────────
  program
    .command('diff')
    .description('Compare keys between .env and its vault')
    .argument('[env-file]', '.env file', '.env')
    .argument('[vault-file]', 'Vault file', '.env.vault')
    .option('-p, --password <password>', 'Password')
    .option('--values', 'Show changed values (careful in shared terminals)')
    .action(async (envFile, vaultFile, opts) => {
      const envPath = resolve(envFile);
      const vaultPath = resolve(vaultFile);

      if (!existsSync(envPath)) {
        console.error(`Error: ${envFile} not found`);
        process.exit(1);
      }
      if (!existsSync(vaultPath)) {
        console.error(`Error: ${vaultFile} not found`);
        process.exit(1);
      }

      const [envContent, vaultContent] = await Promise.all([
        readFile(envPath, 'utf8'),
        readFile(vaultPath, 'utf8'),
      ]);

      const password = opts.password || await getPassword();

      try {
        const decrypted = await open(vaultContent, password);
        const envVars = parseEnv(envContent);
        const vaultVars = parseEnv(decrypted);

        const envKeys = new Set(Object.keys(envVars));
        const vaultKeys = new Set(Object.keys(vaultVars));

        const added = [...envKeys].filter((k) => !vaultKeys.has(k));
        const removed = [...vaultKeys].filter((k) => !envKeys.has(k));
        const changed = [...envKeys].filter(
          (k) => vaultKeys.has(k) && envVars[k] !== vaultVars[k]
        );
        const unchanged = [...envKeys].filter(
          (k) => vaultKeys.has(k) && envVars[k] === vaultVars[k]
        );

        if (added.length === 0 && removed.length === 0 && changed.length === 0) {
          console.log('In sync — no differences found');
          process.exit(0);
        }

        if (added.length > 0) {
          console.log(`\n  + Added (in ${envFile}, not in vault):`);
          added.forEach((k) => console.log(`    + ${k}`));
        }
        if (removed.length > 0) {
          console.log(`\n  - Removed (in vault, not in ${envFile}):`);
          removed.forEach((k) => console.log(`    - ${k}`));
        }
        if (changed.length > 0) {
          console.log(`\n  ~ Changed:`);
          changed.forEach((k) => {
            if (opts.values) {
              console.log(`    ~ ${k}: "${vaultVars[k]}" -> "${envVars[k]}"`);
            } else {
              console.log(`    ~ ${k}`);
            }
          });
        }
        if (unchanged.length > 0) {
          console.log(`\n  = Unchanged: ${unchanged.length} keys`);
        }
        console.log('');

        process.exit(1);
      } catch (err) {
        if (err.message.includes('Authentication failed')) {
          console.error('Error: Wrong password or corrupted vault');
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
    });

  // ── keys ─────────────────────────────────────────────────────────
  program
    .command('keys')
    .description('List all keys in a vault (without values)')
    .argument('[file]', 'Vault file', '.env.vault')
    .option('-p, --password <password>', 'Password')
    .action(async (file, opts) => {
      const vaultPath = resolve(file);

      if (!existsSync(vaultPath)) {
        console.error(`Error: ${file} not found`);
        process.exit(1);
      }

      const content = await readFile(vaultPath, 'utf8');
      const password = opts.password || await getPassword();

      try {
        const decrypted = await open(content, password);
        const vars = parseEnv(decrypted);
        Object.keys(vars).forEach((k) => console.log(k));
      } catch (err) {
        if (err.message.includes('Authentication failed')) {
          console.error('Error: Wrong password or corrupted vault');
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
    });

  program.parse();
}
