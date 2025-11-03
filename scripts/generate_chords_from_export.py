import json
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
export_path = repo_root / 'data' / 'spiewnik-instrumentalist-2025-11-03-17-36-01.json'
out_path = repo_root / 'data' / 'chords.json'

if not export_path.exists():
    print(f"Export file not found: {export_path}")
    raise SystemExit(1)

with export_path.open('r', encoding='utf-8') as f:
    data = json.load(f)

songs = data.get('songs', []) if isinstance(data, dict) else []

chords_map = {}
for s in songs:
    sid = s.get('id') or s.get('title') or None
    if not sid:
        continue
    chords_map[sid] = s.get('chords') or ''

out = {'chords': chords_map}
with out_path.open('w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f'Wrote {len(chords_map)} chord entries to {out_path}')
