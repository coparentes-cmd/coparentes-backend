#!/usr/bin/env node
/**
 * PoC: E2E szyfrowanie czatu — klucz należy do WĄTKU (Thread), nie do pary użytkowników.
 *
 * Model:
 * - jeden losowy klucz symetryczny na wątek (AES-like via crypto_secretbox)
 * - ten klucz jest „opakowany” (sealed) osobno dla każdego uczestnika jego kluczem publicznym X25519
 * - usunięcie jednego uczestnika nie odbiera dostępu pozostałym (mają własne kopie klucza wątku)
 *
 * Uruchomienie: node scripts/e2e-poc.js
 * Nie łączy się z DB ani resztą aplikacji.
 */
import sodium from 'libsodium-wrappers';

function b64(bytes) {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

/**
 * Wyzeruj sekrety w miejscu (sodium.memzero) i usuń referencje.
 *
 * Ograniczenie demonstracji: memzero zeruje dany Uint8Array w miejscu, ale nie
 * gwarantuje, że V8 nie skopiował bajtów wcześniej (np. przy operacjach tworzących
 * kopie TypedArray). Bezpieczne czyszczenie pamięci w JS ma fundamentalne limity —
 * to nie jest ten sam poziom gwarancji co w C z explicit_bzero / sodium_memzero
 * na stercie kontrolowanej przez aplikację.
 */
function wipeSecretBuffers(label, obj) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value instanceof Uint8Array) {
      sodium.memzero(value);
    }
    obj[key] = null;
  }
  console.log(
    `\n[Usunięcie konta] ${label}: bufory sekretów wyzerowane przez sodium.memzero(); referencje usunięte`
  );
}

function wipeBuffer(label, bytes) {
  if (bytes instanceof Uint8Array) {
    sodium.memzero(bytes);
  }
  console.log(
    `[Usunięcie konta] ${label}: bufor wyzerowany przez sodium.memzero(); referencja do usunięcia przez wywołującego`
  );
}

async function main() {
  // ---------------------------------------------------------------------------
  // 1. Inicjalizacja libsodium (WASM / native bindings muszą być gotowe)
  // ---------------------------------------------------------------------------
  console.log('=== 1. Inicjalizacja libsodium ===');
  await sodium.ready;
  console.log('libsodium gotowy (wersja API crypto_box / secretbox dostępna).');

  // ---------------------------------------------------------------------------
  // 2. Dwie pary kluczy X25519 — to są długoterminowe klucze tożsamości rodziców.
  //    W produkcji: prywatny klucz tylko na urządzeniu użytkownika; publiczny w DB.
  // ---------------------------------------------------------------------------
  console.log('\n=== 2. Generowanie par kluczy X25519 (Anna, Piotr) ===');
  const anna = sodium.crypto_box_keypair();
  const piotr = sodium.crypto_box_keypair();
  console.log('Anna  — klucz publiczny (base64):', b64(anna.publicKey));
  console.log('Piotr — klucz publiczny (base64):', b64(piotr.publicKey));
  console.log(
    '(Klucze prywatne NIE są wypisywane — w PoC trzymamy je tylko w zmiennych lokalnych.)'
  );

  // ---------------------------------------------------------------------------
  // 3. Jeden losowy klucz symetryczny 256-bit dla WĄTKU czatu.
  //    Wszystkie wiadomości w wątku szyfrujemy tym samym kluczem (z różnymi nonce).
  // ---------------------------------------------------------------------------
  console.log('\n=== 3. Generowanie klucza symetrycznego wątku ===');
  const threadKey = sodium.crypto_secretbox_keygen();
  console.log('Klucz wątku (base64, tylko do demo — w prod nigdy w logach):', b64(threadKey));
  console.log('Długość:', threadKey.length, 'bajtów (oczekiwane 32 = 256 bit).');

  // ---------------------------------------------------------------------------
  // 4. Opakowanie (wrap) klucza wątku OSOBNO dla każdego uczestnika.
  //    crypto_box_seal = anonymous sealed box: wystarczy klucz publiczny odbiorcy;
  //    nadawca nie musi ujawniać swojej tożsamości kryptograficznej.
  //    W DB: dwa niezależne rekordy ThreadKey (userId → ciphertext).
  // ---------------------------------------------------------------------------
  console.log('\n=== 4. Sealed-box klucza wątku dla Anny i Piotra (osobno) ===');
  const threadKeyForAnna = sodium.crypto_box_seal(threadKey, anna.publicKey);
  const threadKeyForPiotr = sodium.crypto_box_seal(threadKey, piotr.publicKey);
  console.log('ThreadKey[Anna]  (base64):', b64(threadKeyForAnna));
  console.log('ThreadKey[Piotr] (base64):', b64(threadKeyForPiotr));
  console.log(
    'Uwaga: to dwa różne ciphertexty tego samego plaintextu — każdy otwiera tylko właściciel prywatnego klucza.'
  );

  // ---------------------------------------------------------------------------
  // 5. Szyfrowanie treści wiadomości kluczem wątku (crypto_secretbox_easy + losowy nonce).
  //    W DB: jedna kopia ciphertextu wiadomości (nie per odbiorca).
  // ---------------------------------------------------------------------------
  console.log('\n=== 5. Szyfrowanie wiadomości kluczem wątku ===');
  const plaintext =
    'Cześć, może odbiorę Zosię w piątek o 16?';
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    threadKey
  );
  console.log('Plaintext:', plaintext);
  console.log('Nonce (base64):', b64(nonce));
  console.log('Ciphertext wiadomości (base64):', b64(ciphertext));
  // Po zapisie ciphertextu serwer w prod nie powinien trzymać plaintextowego threadKey —
  // tylko sealed kopie uczestników + ciphertext wiadomości (+ nonce).
  console.log(
    'Symulacja: serwer nie trzyma plaintextowego klucza wątku — tylko sealed kopie + ciphertext wiadomości.'
  );

  // ---------------------------------------------------------------------------
  // 6. Odczyt przez Annę: seal_open → secretbox_open
  // ---------------------------------------------------------------------------
  console.log('\n=== 6. Odczyt przez Annę ===');
  let annaThreadKey = sodium.crypto_box_seal_open(
    threadKeyForAnna,
    anna.publicKey,
    anna.privateKey
  );
  const annaPlainBytes = sodium.crypto_secretbox_open_easy(
    ciphertext,
    nonce,
    annaThreadKey
  );
  const annaPlain = sodium.to_string(annaPlainBytes);
  console.log('Anna odszyfrowała klucz wątku ze swojego ThreadKey.');
  console.log('Anna odszyfrowała wiadomość:', annaPlain);
  assertEqual(annaPlain, plaintext, 'treść Anny');

  // ---------------------------------------------------------------------------
  // 7. Odczyt przez Piotra — niezależna kopia ThreadKey
  // ---------------------------------------------------------------------------
  console.log('\n=== 7. Odczyt przez Piotra (niezależna kopia) ===');
  const piotrThreadKey = sodium.crypto_box_seal_open(
    threadKeyForPiotr,
    piotr.publicKey,
    piotr.privateKey
  );
  const piotrPlainBytes = sodium.crypto_secretbox_open_easy(
    ciphertext,
    nonce,
    piotrThreadKey
  );
  const piotrPlain = sodium.to_string(piotrPlainBytes);
  console.log('Piotr odszyfrował klucz wątku ze swojego ThreadKey.');
  console.log('Piotr odszyfrował wiadomość:', piotrPlain);
  assertEqual(piotrPlain, plaintext, 'treść Piotra');

  // ---------------------------------------------------------------------------
  // 8. Usunięcie konta Anny — Piotr nadal ma dostęp
  // ---------------------------------------------------------------------------
  console.log('\n=== 8. Usunięcie konta Anny — dostęp Piotra nienaruszony ===');
  // Odszyfrowany klucz wątku z kroku 6 — też sekret; wipe keypair go nie obejmuje.
  wipeBuffer('Anna.threadKey (odszyfrowany w kroku 6)', annaThreadKey);
  annaThreadKey = null;
  wipeSecretBuffers('Anna (keypair)', anna);

  // Anna nie może już otworzyć swojej kopii (brak privateKey).
  let annaStillCanDecrypt = false;
  try {
    if (anna.privateKey) {
      sodium.crypto_box_seal_open(threadKeyForAnna, anna.publicKey, anna.privateKey);
      annaStillCanDecrypt = true;
    }
  } catch {
    annaStillCanDecrypt = false;
  }
  console.log(
    'Czy Anna (po usunięciu kluczy) może dalej odszyfrować?',
    annaStillCanDecrypt ? 'TAK (błąd PoC!)' : 'NIE — brak klucza prywatnego'
  );

  // Piotr używa WYŁĄCZNIE swojej sealed kopii — nie zależy od Anny.
  const piotrThreadKeyAfter = sodium.crypto_box_seal_open(
    threadKeyForPiotr,
    piotr.publicKey,
    piotr.privateKey
  );
  const piotrPlainAfter = sodium.to_string(
    sodium.crypto_secretbox_open_easy(ciphertext, nonce, piotrThreadKeyAfter)
  );
  console.log('Piotr NADAL odszyfrowuje wiadomość:', piotrPlainAfter);
  assertEqual(piotrPlainAfter, plaintext, 'treść Piotra po usunięciu Anny');

  console.log('\n=== PoC zakończony sukcesem ===');
  console.log(
    'Wniosek: klucz wątku + osobne sealed kopie per uczestnik → usunięcie jednego rodzica nie kasuje dostępu drugiego do historii czatu.'
  );
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Asercja nieudana (${label}): oczekiwano "${expected}", otrzymano "${actual}"`);
  }
  console.log(`✓ asercja OK (${label})`);
}

main().catch((error) => {
  console.error('\nPoC FAILED:', error);
  process.exit(1);
});
