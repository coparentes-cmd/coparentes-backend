const KNOWN_STORES = [
  { pattern: /\btk\s*maxx\b|\btjx\b/i, title: 'TK Maxx', category: 'Ubrania' },
  { pattern: /\bh\s*&\s*m\b|\bh&m\b/i, title: 'H&M', category: 'Ubrania' },
  { pattern: /\bzara\b/i, title: 'Zara', category: 'Ubrania' },
  { pattern: /\breserved\b/i, title: 'Reserved', category: 'Ubrania' },
  { pattern: /\bsinsay\b/i, title: 'Sinsay', category: 'Ubrania' },
  { pattern: /\bpepco\b/i, title: 'Pepco', category: 'Ubrania' },
  { pattern: /\bccc\b/i, title: 'CCC', category: 'Ubrania' },
  { pattern: /\baction\b/i, title: 'Action', category: 'Inne' },
  { pattern: /\bbiedronka\b/i, title: 'Biedronka', category: 'Jedzenie' },
  { pattern: /\blidl\b/i, title: 'Lidl', category: 'Jedzenie' },
  { pattern: /\bcarrefour\b/i, title: 'Carrefour', category: 'Jedzenie' },
  { pattern: /\bżabka\b|\bzabka\b/i, title: 'Żabka', category: 'Jedzenie' },
  { pattern: /\bauchan\b/i, title: 'Auchan', category: 'Jedzenie' },
  { pattern: /\bkaufland\b/i, title: 'Kaufland', category: 'Jedzenie' },
  { pattern: /\bdino\b/i, title: 'Dino', category: 'Jedzenie' },
  { pattern: /\borlen\b/i, title: 'Orlen', category: 'Transport' },
  { pattern: /\bapteka\b/i, title: 'Apteka', category: 'Zdrowie' }
];

const CATEGORY_KEYWORDS = [
  { category: 'Zdrowie', patterns: [/apteka/i, /leki/i, /medyc/i, /dent/i, /szpital/i, /zdrow/i] },
  { category: 'Szkoła', patterns: [/szko/i, /ksiaz/i, /ksiaż/i, /podrecz/i, /podręcz/i, /nauka/i] },
  { category: 'Zajęcia', patterns: [/sport/i, /plywan/i, /pływan/i, /trening/i, /korepety/i, /zajec/i, /zajęc/i] },
  {
    category: 'Ubrania',
    patterns: [
      /odzie/i,
      /buty/i,
      /h&m/i,
      /zara/i,
      /reserved/i,
      /tk\s*maxx/i,
      /tjx/i,
      /sinsay/i,
      /pepco/i,
      /poduszk/i,
      /wycieraczk/i
    ]
  },
  {
    category: 'Jedzenie',
    patterns: [/biedronka/i, /lidl/i, /carrefour/i, /zabka/i, /żabka/i, /market/i, /spozy/i, /spoży/i]
  },
  { category: 'Transport', patterns: [/orlen/i, /\bbp\b/i, /paliw/i, /parking/i, /bilet/i] }
];

const AMOUNT_PATTERNS = [
  /(?:suma\s*pln|suma|razem|total|do\s+zaplaty|do\s+zapłaty|kwota|nalezn|należn)[:\s]*(\d+[.,]\d{2})/i,
  /(\d+[.,]\d{2})\s*(?:PLN|zł|zl)\b/i,
  /(?:PLN|zł|zl)\s*(\d+[.,]\d{2})/i
];

const DATE_PATTERNS = [
  /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/,
  /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/
];

function normalizeAmount(raw) {
  const value = Number.parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function cleanTitle(line) {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[\s|:_-]+|[\s|:_-]+$/g, '')
    .slice(0, 80);
}

function letterStats(line) {
  const letters = line.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
  if (letters.length === 0) {
    return { letters: 0, vowelRatio: 0 };
  }
  const vowels = (letters.match(/[aeiouyąęóAEIOUYĄĘÓ]/gi) || []).length;
  return { letters: letters.length, vowelRatio: vowels / letters.length };
}

function looksLikeGarbage(line) {
  const { letters, vowelRatio } = letterStats(line);
  if (letters < 4) {
    return true;
  }
  // OCR noise like "PARRUUK FI KALRY"
  if (vowelRatio < 0.22) {
    return true;
  }
  if (/[bcdfghjklmnpqrstvwxzłćśźż]{5,}/i.test(line.replace(/\s/g, ''))) {
    return true;
  }
  // Too many unusual uppercase clusters without spaces of real words
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]{6,}(\s+[A-ZĄĆĘŁŃÓŚŹŻ]{2,}){1,3}$/.test(line) && vowelRatio < 0.35) {
    return true;
  }
  return false;
}

function looksLikeMetaOrAddress(line) {
  return (
    /^(paragon|faktura|nip|regon|tel|ul\.|al\.|data|godz|kasjer|sprzed|www\.|http)/i.test(
      line
    ) ||
    /\bnip\b/i.test(line) ||
    /\bregon\b/i.test(line) ||
    /\d{2}-\d{3}\b/.test(line) ||
    /\btel[:.\s]/i.test(line)
  );
}

function looksLikeItemOrCodeLine(line) {
  return (
    /\d+\s*szt/i.test(line) ||
    /^\d{1,3}\/\d{1,3}\b/.test(line) ||
    /\b\d{4,}\b.*\d+[.,]\d{2}/.test(line) ||
    /ptu|vat\s*\d/i.test(line) ||
    /rozliczenie|platnosc|płatność|karta/i.test(line) ||
    /suma\s*pln|do\s+zap/i.test(line)
  );
}

function inferKnownStore(text) {
  for (const store of KNOWN_STORES) {
    if (store.pattern.test(text)) {
      return store;
    }
  }
  return null;
}

function inferCategory(text, knownStore) {
  if (knownStore?.category) {
    return knownStore.category;
  }
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.category;
    }
  }
  return 'Inne';
}

function inferTitle(lines, fullText, knownStore) {
  if (knownStore?.title) {
    return knownStore.title;
  }

  for (const line of lines) {
    if (/sp\.?\s*z\s*o\.?\s*o\.?/i.test(line) && !looksLikeGarbage(line)) {
      // "TJX Poland Sp. z o.o." → keep company brand if short enough
      const cleaned = cleanTitle(line.replace(/\bsp\.?\s*z\s*o\.?\s*o\.?/gi, '').trim());
      if (cleaned.length >= 3 && !looksLikeGarbage(cleaned)) {
        return cleaned.slice(0, 60);
      }
      return cleanTitle(line);
    }
  }

  for (const line of lines.slice(0, 12)) {
    if (line.length < 4 || line.length > 60) continue;
    if (/^\d+[.,]?\d*$/.test(line)) continue;
    if (looksLikeMetaOrAddress(line)) continue;
    if (looksLikeItemOrCodeLine(line)) continue;
    if (looksLikeGarbage(line)) continue;
    return cleanTitle(line);
  }

  return 'Wydatek z paragonu';
}

function inferAmount(text, lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    for (const pattern of AMOUNT_PATTERNS) {
      const match = lines[i].match(pattern);
      if (match) {
        const amount = normalizeAmount(match[1]);
        if (amount) return amount;
      }
    }
  }

  const sumaMatch = text.match(/suma\s*pln\s*(\d+[.,]\d{2})/i);
  if (sumaMatch) {
    const amount = normalizeAmount(sumaMatch[1]);
    if (amount) return amount;
  }

  const candidates = [];
  for (const match of text.matchAll(/(\d+[.,]\d{2})/g)) {
    const amount = normalizeAmount(match[1]);
    if (amount) candidates.push(amount);
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => b - a)[0];
}

function inferDate(text) {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // Noon UTC avoids off-by-one day when clients parse ISO in local TZ.
    if (pattern === DATE_PATTERNS[0]) {
      const [, dd, mm, yyyy] = match;
      return new Date(
        Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0)
      ).toISOString();
    }

    const [, yyyy, mm, dd] = match;
    return new Date(
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0)
    ).toISOString();
  }

  return null;
}

export function parseReceiptText(text) {
  const normalized = String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const knownStore = inferKnownStore(normalized);
  const amount = inferAmount(normalized, lines);
  const title = inferTitle(lines, normalized, knownStore);
  const category = inferCategory(normalized, knownStore);
  const date = inferDate(normalized);

  return {
    title,
    amount,
    category,
    date,
    confidence: amount
      ? title !== 'Wydatek z paragonu'
        ? knownStore
          ? 'high'
          : 'medium'
        : 'low'
      : 'low',
    rawTextPreview: normalized.slice(0, 400)
  };
}
