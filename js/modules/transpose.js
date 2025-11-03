const NOTE_COUNT = 12;

const INDEX_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
const INDEX_TO_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'];

const LETTER_BASE_INDEX = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 10,
  H: 11,
};

const ACCIDENTAL_S_BASES = new Set(['A', 'E']);
const SLASH_NOTE_REGEX = /\/([A-Ha-h](?:#{1,2}|b{1,2}|is|es|s)?)/g;
const CHORD_SUFFIX_KEYWORDS = ['maj', 'min', 'moll', 'mol', 'dim', 'aug', 'sus', 'add', 'M', 'm'];
const CHORD_SUFFIX_TOKEN_REGEX = new RegExp(
  `(?:${[...CHORD_SUFFIX_KEYWORDS].sort((a, b) => b.length - a.length).join('|')})`,
  'g',
);
const CHORD_SUFFIX_ALLOWED_CHARS_REGEX = /[0-9()+\-#b/]/g;
const LETTER_CHAR_REGEX = /\p{L}/u;
const IN_WORD_ACCIDENTAL_REGEX = /(?<=\p{L})[A-Ha-h](?:#{1,2}|b{1,2})(?=\p{L})/gu;

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text) {
  return (text || '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function renderChordToken(token) {
  let output = '';
  let index = 0;

  while (index < token.length) {
    const char = token.charAt(index);
    if (char === '(') {
      const closeIndex = token.indexOf(')', index + 1);
      if (closeIndex !== -1) {
        const chunk = token.slice(index, closeIndex + 1);
        output += `<sup>${escapeHtml(chunk)}</sup>`;
        index = closeIndex + 1;
        continue;
      }
    }
    output += escapeHtml(char);
    index += 1;
  }

  return output;
}

function renderChordHtml(text) {
  if (!text) return '';
  let html = '';
  let lastIndex = 0;

  text.replace(CHORD_TOKEN_REGEX, (token, offset, input) => {
    const prevChar = input.charAt(offset - 1);
    if (prevChar && LETTER_CHAR_REGEX.test(prevChar)) {
      return token;
    }
    const nextChar = input.charAt(offset + token.length);
    if (nextChar && LETTER_CHAR_REGEX.test(nextChar)) {
      return token;
    }
    html += escapeHtml(input.slice(lastIndex, offset));
    html += renderChordToken(token);
    lastIndex = offset + token.length;
    return token;
  });

  if (lastIndex < text.length) {
    html += escapeHtml(text.slice(lastIndex));
  }

  // Preserve user line breaks when producing HTML for innerHTML assignment.
  // Convert newline characters to <br> so contentEditable shows the same
  // layout the user typed.
  return html.replace(/\n/g, '<br>');
}

function parseAccidentalTokens(baseLetter, rest) {
  const tokens = [];
  let consumed = 0;
  const lower = rest.toLowerCase();

  while (consumed < rest.length) {
    const segment = lower.slice(consumed);

    if (segment.startsWith('##')) {
      tokens.push({ raw: rest.slice(consumed, consumed + 2), type: 'sharp', normalized: '##', offset: 2 });
      consumed += 2;
      continue;
    }

    if (segment.startsWith('bb')) {
      tokens.push({ raw: rest.slice(consumed, consumed + 2), type: 'flat', normalized: 'bb', offset: -2 });
      consumed += 2;
      continue;
    }

    if (segment.startsWith('#')) {
      tokens.push({ raw: '#', type: 'sharp', normalized: '#', offset: 1 });
      consumed += 1;
      continue;
    }

    if (segment.startsWith('b')) {
      tokens.push({ raw: 'b', type: 'flat', normalized: 'b', offset: -1 });
      consumed += 1;
      continue;
    }

    if (segment.startsWith('is')) {
      tokens.push({ raw: rest.slice(consumed, consumed + 2), type: 'sharp', normalized: '#', offset: 1 });
      consumed += 2;
      continue;
    }

    if (segment.startsWith('es')) {
      tokens.push({ raw: rest.slice(consumed, consumed + 2), type: 'flat', normalized: 'b', offset: -1 });
      consumed += 2;
      continue;
    }

    if (segment.startsWith('s') && ACCIDENTAL_S_BASES.has(baseLetter) && !segment.startsWith('sus')) {
      tokens.push({ raw: rest.slice(consumed, consumed + 1), type: 'flat', normalized: 'b', offset: -1 });
      consumed += 1;
      continue;
    }

    break;
  }

  return { tokens, consumed };
}

function buildNoteInfo(baseLetter, tokens, isLowerCase) {
  const baseIndex = LETTER_BASE_INDEX[baseLetter];
  if (typeof baseIndex !== 'number') return null;

  const offset = tokens.reduce((sum, token) => sum + token.offset, 0);
  const hasSharps = tokens.some((token) => token.type === 'sharp');
  const hasFlats = tokens.some((token) => token.type === 'flat');
  const normalizedAccidental = tokens.map((token) => token.normalized).join('');

  return {
    index: wrapIndex(baseIndex + offset),
    baseLetter,
    isLowerCase,
    hasSharps,
    hasFlats,
    normalizedAccidental,
  };
}

function splitNoteRoot(raw) {
  if (!raw) return null;
  const first = raw.charAt(0);
  const baseLetter = first.toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(LETTER_BASE_INDEX, baseLetter)) return null;

  const rest = raw.slice(1);
  const { tokens, consumed } = parseAccidentalTokens(baseLetter, rest);
  const rootLength = 1 + consumed;
  const noteInfo = buildNoteInfo(baseLetter, tokens, first === first.toLowerCase());
  if (!noteInfo) return null;

  return {
    noteInfo,
    rootLength,
    remainder: raw.slice(rootLength),
    rootRaw: raw.slice(0, rootLength),
    tokens,
  };
}

function isLikelyChordSuffix(remainder) {
  if (!remainder) return true;
  let rest = remainder.replace(SLASH_NOTE_REGEX, '');
  rest = rest.replace(CHORD_SUFFIX_TOKEN_REGEX, '');
  rest = rest.replace(CHORD_SUFFIX_ALLOWED_CHARS_REGEX, '');
  return rest.length === 0;
}

function formatRootForNotation(split, strict) {
  const { noteInfo } = split;
  if (!noteInfo) return '';

  if (strict && noteInfo.baseLetter === 'B' && !noteInfo.normalizedAccidental) {
    return noteInfo.isLowerCase ? 'h' : 'H';
  }

  if (noteInfo.baseLetter === 'B' && noteInfo.normalizedAccidental === 'b') {
    return noteInfo.isLowerCase ? 'b' : 'B';
  }

  const preferSharps = shouldPreferSharps(0, noteInfo);
  return formatNote(noteInfo.index, preferSharps, noteInfo.isLowerCase);
}

// Match tokens that look like chords only to avoid mangling regular text.
export const CHORD_TOKEN_REGEX =
  /\b[A-Ha-hXx](?:#{1,2}|b{1,2}|is|es|s)*(?:maj|min|moll|mol|m|dim|aug|sus|add|M|[0-9()\/+\-#b])*(?=$|[^A-Za-z])/g;

function replaceChordTokens(text, transformer) {
  if (!text) return '';
  return text.replace(CHORD_TOKEN_REGEX, (token, offset, input) => {
    const prevChar = input.charAt(offset - 1);
    if (prevChar && LETTER_CHAR_REGEX.test(prevChar)) {
      return token;
    }
    const nextChar = input.charAt(offset + token.length);
    if (nextChar && LETTER_CHAR_REGEX.test(nextChar)) {
      return token;
    }
    const replacement = transformer(token, offset, input);
    return typeof replacement === 'string' ? replacement : token;
  });
}

export function convertChordNotation(text, options = {}) {
  if (!text) return '';
  const strict = options.strict === true;
  const normalized = replaceChordTokens(text, (token) => {
    const split = splitNoteRoot(token);
    if (!split || !isLikelyChordSuffix(split.remainder)) return token;

    const root = formatRootForNotation(split, strict);
    const tail = split.remainder.replace(SLASH_NOTE_REGEX, (full, bassRaw) => {
      const bassSplit = splitNoteRoot(bassRaw);
      if (!bassSplit || bassSplit.remainder) return full;
      const bassRoot = formatRootForNotation(bassSplit, strict);
      return `/${bassRoot}`;
    });

    return root + tail;
  });

  return normalized.replace(IN_WORD_ACCIDENTAL_REGEX, (match) => match.charAt(0));
}

export function normalizeChordFieldDom(element) {
  if (!element) return false;
  const original = element.textContent ?? '';
  const normalized = convertChordNotation(original);
  const normalizedHtml = renderChordHtml(normalized);
  const mutated = element.innerHTML !== normalizedHtml;
  if (mutated) {
    element.innerHTML = normalizedHtml;
  }
  if (mutated || !element.dataset.notationPolish) {
    element.dataset.notationPolish = '1';
  }
  return mutated;
}

function wrapIndex(value) {
  return ((value % NOTE_COUNT) + NOTE_COUNT) % NOTE_COUNT;
}

function parseNote(raw) {
  const split = splitNoteRoot(raw);
  if (!split || split.remainder) return null;
  return split.noteInfo;
}

function shouldPreferSharps(steps, noteInfo) {
  if (noteInfo.hasFlats) return false;
  if (noteInfo.hasSharps) return true;
  if (steps === 0) {
    if (noteInfo.baseLetter === 'B') return false;
    return true;
  }
  if (steps > 0) return true;
  if (steps < 0) return false;
  return true;
}

function formatNote(index, preferSharps, isLowerCase) {
  let note = (preferSharps ? INDEX_TO_SHARP : INDEX_TO_FLAT)[wrapIndex(index)];
  if (isLowerCase) {
    note = note.charAt(0).toLowerCase() + note.slice(1);
  }
  return note;
}

export function transposeChord(chord, steps) {
  const split = splitNoteRoot(chord);
  if (!split || !isLikelyChordSuffix(split.remainder)) return chord;

  const { noteInfo, remainder } = split;
  const preferSharpsRoot = shouldPreferSharps(steps, noteInfo);
  const root = formatNote(noteInfo.index + steps, preferSharpsRoot, noteInfo.isLowerCase);

  const tail = remainder.replace(SLASH_NOTE_REGEX, (full, bassRaw) => {
    const bassSplit = splitNoteRoot(bassRaw);
    if (!bassSplit || bassSplit.remainder) return full;
    const bassInfo = bassSplit.noteInfo;
    const preferSharpsBass = shouldPreferSharps(steps, bassInfo);
    const bassNote = formatNote(bassInfo.index + steps, preferSharpsBass, bassInfo.isLowerCase);
    return `/${bassNote}`;
  });

  return root + tail;
}

function applyTransposition(songElement, level) {
  songElement.querySelectorAll('.chords').forEach((field) => {
    // Do not mutate the field's DOM automatically. Use the raw textContent
    // as the "original" source for transposition so we never overwrite the
    // user's input format unexpectedly.
    if (!field.dataset.original) {
      field.dataset.original = field.textContent || '';
    }
    const original = field.dataset.original || '';
    const transposed = replaceChordTokens(original, (token) => transposeChord(token, level));
    field.innerHTML = renderChordHtml(transposed);
    field.dataset.notationPolish = '1';
  });
}

function updateLevelLabel(levelElement, level) {
  levelElement.dataset.level = String(level);
  levelElement.textContent = level > 0 ? `+${level}` : String(level);
}

export function initTransposeControls(songElement) {
  const upBtn = songElement.querySelector('.transpose-up');
  const downBtn = songElement.querySelector('.transpose-down');
  const levelElement = songElement.querySelector('.transpose-level');
  if (!upBtn || !downBtn || !levelElement) return;

  const handle = (delta) => {
    const current = parseInt(levelElement.dataset.level || '0', 10);
    const next = current + delta;
    updateLevelLabel(levelElement, next);
    applyTransposition(songElement, next);
  };

  upBtn.addEventListener('click', () => handle(1));
  downBtn.addEventListener('click', () => handle(-1));
}

export function resetTransposeForSong(songElement) {
  const levelElement = songElement.querySelector('.transpose-level');
  if (!levelElement) return;
  updateLevelLabel(levelElement, 0);
  songElement.querySelectorAll('.chords').forEach((field) => {
    if (field.dataset.original) {
      field.innerHTML = renderChordHtml(field.dataset.original || '');
    }
    field.dataset.notationPolish = '1';
  });
}

// Observe chord field edits. Default behaviour: do NOT auto-normalize while
// the user is typing — treat fields like a plain text editor. To enable the
// older behaviour (normalize on blur / reset transpose level on input), call
// with the option { normalizeOnBlur: true }.
export function observeChordFieldEdits(root = document, { normalizeOnBlur = false } = {}) {
  if (!normalizeOnBlur) {
    // No-op: user asked that editing should not be modified automatically.
    return;
  }
<<<<<<< HEAD

=======
>>>>>>> da034a3 (Pierwszy commit - śpiewnik)
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('chords')) return;
    delete target.dataset.original;
    delete target.dataset.notationPolish;
    const songRoot = target.closest('.song');
    if (songRoot) {
      const levelElement = songRoot.querySelector('.transpose-level');
      if (levelElement) {
        updateLevelLabel(levelElement, 0);
      }
    }
  });

  root.addEventListener(
    'blur',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('chords')) return;
      normalizeChordFieldDom(target);
    },
    true,
  );
}
