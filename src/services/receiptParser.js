const CATEGORY_KEYWORDS = [
  { category: 'Zdrowie', patterns: [/apteka/i, /leki/i, /medyc/i, /dent/i, /szpital/i, /zdrow/i] },
  { category: 'Szkoła', patterns: [/szko/i, /ksiaz/i, /ksiaż/i, /podrecz/i, /podręcz/i, /nauka/i] },
  { category: 'Zajęcia', patterns: [/sport/i, /plywan/i, /pływan/i, /trening/i, /korepety/i, /zajec/i, /zajęc/i] },
  { category: 'Ubrania', patterns: [/odzie/i, /buty/i, /h&m/i, /zara/i, /reserved/i] },
  { category: 'Jedzenie', patterns: [/biedronka/i, /lidl/i, /carrefour/i, /zabka/i, /żabka/i, /market/i, /spozy/i, /spoży/i] },
  { category: 'Transport', patterns: [/orlen/i, /bp\b/i, /paliw/i, /parking/i, /bilet/i] }
];

const AMOUNT_PATTERNS = [
  /(?:suma|razem|total|do\s+zaplaty|do\s+zapłaty|kwota|nalezn|należn)[:\s]*(\d+[.,]\d{2})/i,
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

function inferCategory(text) {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.category;
    }
  }
  return 'Inne';
}

function inferTitle(lines) {
  for (const line of lines) {
    if (line.length < 4) continue;
    if (/^\d+[.,]?\d*$/.test(line)) continue;
    if (/^(paragon|faktura|nip|regon|tel|ul\.|data|godz)/i.test(line)) continue;
    return line.slice(0, 120);
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

    if (pattern === DATE_PATTERNS[0]) {
      const [, dd, mm, yyyy] = match;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).toISOString();
    }

    const [, yyyy, mm, dd] = match;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).toISOString();
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

  const amount = inferAmount(normalized, lines);
  const title = inferTitle(lines);
  const category = inferCategory(normalized);
  const date = inferDate(normalized);

  return {
    title,
    amount,
    category,
    date,
    confidence: amount ? (title !== 'Wydatek z paragonu' ? 'medium' : 'low') : 'low',
    rawTextPreview: normalized.slice(0, 400)
  };
}
