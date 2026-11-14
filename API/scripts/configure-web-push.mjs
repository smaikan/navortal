import { createECDH, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, open, readFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Run once on the API host. Existing keys are validated and preserved across deployments.
const destination = new URL('../.local/push.env', import.meta.url);
const subject = process.argv[2];
function validate(settings) {
  const contact = new URL(settings.Push__Subject);
  if (!['mailto:', 'https:'].includes(contact.protocol) || contact.username || contact.password || contact.hash
      || /[\r\n]/.test(settings.Push__Subject)
      || (contact.protocol === 'mailto:' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.pathname) || contact.search)))
    throw new Error('Use a real mailto or HTTPS contact URI.');
  const key = createECDH('prime256v1');
  key.setPrivateKey(Buffer.from(settings.Push__PrivateKey, 'base64url'));
  const point = key.getPublicKey();
  if (point.toString('base64url') !== settings.Push__PublicKey) throw new Error('The existing VAPID key pair does not match.');
  const jwk = { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: settings.Push__PrivateKey };
  const privateKey = createPrivateKey({ key: jwk, format: 'jwk' });
  const message = Buffer.from('navortal.push.configuration-check');
  if (!verify('sha256', message, createPublicKey(privateKey), sign('sha256', message, privateKey)))
    throw new Error('VAPID verification failed.');
  if (settings.Push__Enabled !== 'true') throw new Error('The existing push configuration is disabled; review it on the host.');
}
try {
  let existing;
  try { existing = await readFile(destination, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing !== undefined) {
    validate(Object.fromEntries(existing.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    })));
    await chmod(destination, 0o600);
    console.log('Existing Web Push configuration verified and preserved.');
  } else {
    const key = createECDH('prime256v1');
    key.generateKeys();
    const settings = { Push__Enabled: 'true', Push__Subject: subject, Push__PublicKey: key.getPublicKey().toString('base64url'), Push__PrivateKey: key.getPrivateKey().toString('base64url') };
    validate(settings);
    await mkdir(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
    const file = await open(destination, 'wx', 0o600);
    try { await file.writeFile(Object.entries(settings).map(([key, value]) => `${key}=${value}\n`).join('')); }
    finally { await file.close(); }
    console.log(`Web Push configuration created at ${fileURLToPath(destination)}. Preserve this private file across deployments.`);
  }
} catch {
  // Crypto errors may contain key material; never print the original exception.
  console.error('Web Push configuration could not be verified. Supply a mailto/HTTPS contact URI and check the private file on the host; existing keys were not replaced.');
  process.exitCode = 1;
}
