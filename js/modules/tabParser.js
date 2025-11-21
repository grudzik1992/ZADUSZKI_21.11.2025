// Simple ASCII-tab parser for aligned rhythm+tab format
// Exports parseTab(text) -> { tokens: [...], events: [{timeBeats, durationBeats, notes: [midi]}], meta }

const STRING_BASES = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2 (high->low)
// Note: our tab lines likely in order E B G D A E from top to bottom; we will handle that.

const DURATION_MAP = {
  W: 4,
  H: 2,
  Q: 1,
  E: 0.5,
  S: 0.25,
  T: 0.125,
  X: 0.0625,
};

function findRhythmLine(lines) {
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const l = lines[i];
    // rhythm line contains tokens separated by spaces using letters like W H Q E S T X
    if (/\b[WHQESTX](?:\.|)\b/.test(l)) return i;
  }
  return -1;
}

function normalizeLines(text) {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

export function parseTab(text) {
  const lines = normalizeLines(text);
  const rhythmIdx = findRhythmLine(lines);
  if (rhythmIdx === -1) return { events: [], error: 'Rhythm line not found' };

  const rhythmLine = lines[rhythmIdx];
  // find token positions
  const tokenMatches = [];
  // token can be like 'E' or 'E.' (dotted)
  const tokenRegex = /[WHQESTX]\.?/g;
  let m;
  while ((m = tokenRegex.exec(rhythmLine)) !== null) {
    tokenMatches.push({ token: m[0], index: m.index });
  }

  // extract next 6 tab lines (allow lines that contain || or |)
  const tabLines = [];
  for (let i = rhythmIdx + 1; i < Math.min(lines.length, rhythmIdx + 12) && tabLines.length < 6; i++) {
    const l = lines[i];
    if (/^[EBA|GDbagc\-\s\d\|].*/i.test(l) || l.includes('||') || l.includes('|')) {
      // try to extract the part after the first "|" to align columns
      tabLines.push(l);
    }
  }

  // Try to find the six standard strings in the collected lines.
  // We will search for lines that start with E|| or E| etc in order E B G D A E (top->bottom in example)
  const extracted = [];
  const order = ['E', 'B', 'G', 'D', 'A', 'E'];
  for (let s = 0; s < order.length; s++) {
    // find first line that contains order[s] and '|' and hasn't been used
    const idx = tabLines.findIndex((ln, i) => !extracted.includes(i) && new RegExp('^\s*' + order[s] + '\b', 'i').test(ln));
    if (idx !== -1) {
      extracted.push(idx);
    }
  }

  // If we didn't find in order, fallback to taking first 6 lines from tabLines
  const finalTab = [];
  if (extracted.length === 6) {
    for (let i = 0; i < 6; i++) finalTab.push(tabLines[extracted[i]]);
  } else if (tabLines.length >= 6) {
    for (let i = 0; i < 6; i++) finalTab.push(tabLines[i]);
  } else {
    return { events: [], error: 'Not enough tab lines (need 6)'};
  }

  // For each token, examine each string line at token.index for a fret number (possibly multi-digit)
  const events = [];
  let cumulativeBeats = 0;
  for (let t = 0; t < tokenMatches.length; t++) {
    const tk = tokenMatches[t];
    const token = tk.token;
    const idx = tk.index;
    let durBeats = DURATION_MAP[token.replace('.', '')] || 0;
    if (token.endsWith('.')) durBeats *= 1.5;

    const notes = [];
    // For each of 6 strings, look for a number starting at or near idx
    for (let s = 0; s < 6; s++) {
      const line = finalTab[s] || '';
      // find number starting at idx or within next 3 chars
      let fret = null;
      for (let offset = 0; offset < 4; offset++) {
        const pos = idx + offset;
        if (pos < 0 || pos >= line.length) continue;
        // capture multi-digit number
        const sub = line.slice(pos, pos + 3);
        const m2 = sub.match(/^\d{1,3}/);
        if (m2) {
          fret = parseInt(m2[0], 10);
          break;
        }
      }
      if (fret !== null) {
        // map string index to midi note
        // Our finalTab is ordered top->bottom; we expect top = E (high), bottom = E (low)
        const stringBase = STRING_BASES[s];
        const midi = stringBase + fret;
        notes.push(midi);
      }
    }

    if (notes.length) {
      events.push({ timeBeats: cumulativeBeats, durationBeats: durBeats, notes });
    }
    cumulativeBeats += durBeats;
  }

  return { events, tokens: tokenMatches.map(t=>t.token), meta: { beats: cumulativeBeats } };
}
