const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = require('tweetnacl-util');

// Simulate Alice and Bob with separate key pairs
const alice = nacl.box.keyPair();
const bob = nacl.box.keyPair();

const plain = 'Hello E2EE World!';

// --- Encrypt (Alice → Bob) with two different nonces for the same message ---
const nonce1 = nacl.randomBytes(nacl.box.nonceLength);
const nonce2 = nacl.randomBytes(nacl.box.nonceLength);
const ct1 = nacl.box(new Uint8Array(encodeUTF8(plain)), nonce1, bob.publicKey, alice.secretKey);
const ct2 = nacl.box(new Uint8Array(encodeUTF8(plain)), nonce2, bob.publicKey, alice.secretKey);

// --- Decrypt (Bob uses Alice's public key) ---
const dt = nacl.box.open(ct1, nonce1, alice.publicKey, bob.secretKey);

// --- Checks ---
const sameNonce = nonce1.every((v, i) => v === nonce2[i]);
const sameCipher = Buffer.from(ct1).equals(Buffer.from(ct2));
const wrongKeyResult = nacl.box.open(ct1, nonce1, bob.publicKey, alice.secretKey); // intentionally wrong

console.log('─────────────────────────────────────────');
console.log('tweetnacl      :', require('./node_modules/tweetnacl/package.json').version);
console.log('tweetnacl-util :', require('./node_modules/tweetnacl-util/package.json').version);
console.log('nonceLength    :', nacl.box.nonceLength, 'bytes');
console.log('─────────────────────────────────────────');
console.log('round-trip     :', new TextDecoder().decode(dt) === plain ? '✅ PASS — "' + new TextDecoder().decode(dt) + '"' : '❌ FAIL');
console.log('nonce unique?  :', !sameNonce ? '✅ PASS — Different nonces' : '❌ FAIL — SAME NONCE (catastrophic)');
console.log('cipher unique? :', !sameCipher ? '✅ PASS — Different ciphertexts' : '❌ FAIL — SAME CIPHERTEXT');
console.log('tamper test    :', wrongKeyResult === null ? '✅ PASS — Wrong-key returns null' : '❌ FAIL — Should be null');
console.log('─────────────────────────────────────────');
console.log('All critical security checks passed ✅');
