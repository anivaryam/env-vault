/**
 * Password prompt utilities
 * Uses stderr for all UI so stdout stays clean for piping
 */

/**
 * Read a password from stdin without echoing
 */
export async function getPassword(message = 'Password: ') {
  if (process.env.ENV_VAULT_KEY) {
    return process.env.ENV_VAULT_KEY;
  }

  if (!process.stdin.isTTY) {
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin });
    return new Promise((resolve) => {
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stderr.write(message);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let password = '';

    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.stdin.setRawMode(false);
        process.stderr.write('\n');
        process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') {
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Prompt for password with confirmation (for sealing)
 */
export async function confirmPassword() {
  const password = await getPassword('Password: ');
  if (!password) {
    console.error('Error: Password cannot be empty');
    process.exit(1);
  }
  const confirm = await getPassword('Confirm password: ');
  if (password !== confirm) {
    console.error('Error: Passwords do not match');
    process.exit(1);
  }
  return password;
}
