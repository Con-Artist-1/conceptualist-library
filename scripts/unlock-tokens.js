import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(APP_DIR, '.env');

// AES-256-GCM Encrypted Token Vault (PBKDF2-SHA256, 100,000 iterations)
// Format: salt_b64.iv_b64.authTag_b64.ciphertext_b64
export const ENCRYPTED_VAULT = 'M0rVF6hL8kSBZKddZZFsVw==.6U6izizH0zJXshHE.B0u2YJezMhxxSX+/Ba1IPA==.swY7bDh/CD67V5IOng2VkA4w4FsFfdO+rAFDkiiMIKihGXTC47sf9jlr1AonTYHYU3UDGYnEhZu05JkzbC92IK/q/VfMmP8iSU2Za3T4Gdk25v7vgbgJEOHtdLjyKu1Ox5SZUegQ1StaN/mAbgNDGe1h7Mis8+WT95hBXxZBdy6Ifrxhjju3Vfv7MVRlLlv0c4N9eBNa0eQgj8rH4U8CGji1BLeSoLWB4cPUHOJWest/KnTH0Dayv0CnEHm1/RjTBsa9LuN/n0/h3rcpaFriVStPDNIHbuHfwg8CX+BZE8sXFDmkB4YCd3Iul9hdMMhQoRByyAx9muyslDIrNo2y/TaLdAOfHRAnfLN+5XVOCyoMWgH98PQSnjmJl0BqR+7LyAT38g==';

export function encryptVault(payloadObj, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(payloadObj);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64')
  ].join('.');
}

export function decryptVault(vaultStr, password) {
  const parts = vaultStr.trim().split('.');
  if (parts.length !== 4) throw new Error('Invalid vault format');
  const [saltB64, ivB64, tagB64, encB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function loadEnvMap() {
  const map = {};
  if (!fs.existsSync(ENV_PATH)) return map;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return map;
}

const arg1 = process.argv[2];
const arg2 = process.argv[3];

if (arg1 === '--encrypt') {
  if (!arg2) {
    console.error('Usage: node scripts/unlock-tokens.js --encrypt <password>');
    process.exit(1);
  }
  const envMap = loadEnvMap();
  const vault = encryptVault(envMap, arg2);
  console.log('ENCRYPTED_VAULT=' + vault);
  const verified = decryptVault(vault, arg2);
  console.log('VERIFIED_KEYS=' + Object.keys(verified).join(','));
} else if (arg1 === '--inspect-gh') {
  const envMap = loadEnvMap();
  const token = envMap.GITHUB_TOKEN;
  const uRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Conceptualist' }
  });
  console.log('USER_STATUS=' + uRes.status);
  const u = await uRes.json();
  console.log('USER_LOGIN=' + u.login);
  const rRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Conceptualist' }
  });
  const repos = await rRes.json();
  if (Array.isArray(repos)) {
    console.log('REPOS=' + repos.map(r => `${r.full_name} (private:${r.private})`).join(', '));
  } else {
    console.log('REPOS_ERR=' + JSON.stringify(repos));
  }
  const vRes = await fetch('https://api.vercel.com/v9/projects/prj_aoqCf7hkChGqzoRb3WGb9cf2KAgp?teamId=team_34CBzFBsKwAwot7TK9eTAPj8', {
    headers: { Authorization: `Bearer ${envMap.VERCEL_TOKEN}` }
  });
  const vData = await vRes.json();
  console.log('VERCEL_LINK=' + JSON.stringify(vData.link || null));
} else if (arg1) {
  try {
    const decoded = decryptVault(ENCRYPTED_VAULT, arg1);
    const lines = [
      '# Local API Tokens (Restored from encrypted vault)',
      ...Object.entries(decoded).map(([k, v]) => `${k}=${v}`),
      ''
    ];
    fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');
    console.log(`Successfully decrypted ${Object.keys(decoded).length} tokens into ${ENV_PATH}`);
  } catch (err) {
    console.error('Failed to decrypt vault (wrong password?):', err.message);
    process.exit(1);
  }
} else {
  console.log('Usage: node scripts/unlock-tokens.js <password>');
}
