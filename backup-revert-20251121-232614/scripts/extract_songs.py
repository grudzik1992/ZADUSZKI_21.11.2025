from __future__ import annotations

import json
from pathlib import Path

from bs4 import BeautifulSoup


def normalize_block(text: str) -> str:
    text = text.replace('\r', '')
    text = text.replace('\xa0', ' ')
    lines = text.split('\n')
    cleaned = [line.rstrip() for line in lines]
    # Remove trailing empty lines
    while cleaned and cleaned[-1] == '':
        cleaned.pop()
    return '\n'.join(cleaned)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    html_path = root / "index.html"
    html = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    songs = []
    for song_el in soup.select('.song'):
        h2 = song_el.select_one('h2')
        if not h2 or not h2.get('id'):
            continue
        song_id = h2['id']
        full_title = h2.get_text(strip=True)
        number = None
        title = full_title
        if '. ' in full_title:
            prefix, rest = full_title.split('. ', 1)
            try:
                number = int(prefix)
                title = rest
            except ValueError:
                number = None
                title = rest
        chords_el = song_el.select_one('.chords')
        lyrics_el = song_el.select_one('.lyrics')
        chords = normalize_block(chords_el.get_text('\n')) if chords_el else ''
        lyrics = normalize_block(lyrics_el.get_text('\n')) if lyrics_el else ''
        songs.append({
            'id': song_id,
            'number': number,
            'title': title,
            'chords': chords,
            'lyrics': lyrics,
        })

    # Preserve original order, fallback numbering
    for idx, song in enumerate(songs, start=1):
        if song['number'] is None:
            song['number'] = idx

    lyrics_payload = {
        'songs': [
            {
                'id': song['id'],
                'number': song['number'],
                'title': song['title'],
                'lyrics': song['lyrics'],
            }
            for song in songs
        ]
    }

    chords_payload = {
        'chords': {
            song['id']: song['chords']
            for song in songs
        }
    }

    data_dir = root / 'data'
    data_dir.mkdir(exist_ok=True)
    (data_dir / 'lyrics.json').write_text(
        json.dumps(lyrics_payload, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    (data_dir / 'chords.json').write_text(
        json.dumps(chords_payload, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
