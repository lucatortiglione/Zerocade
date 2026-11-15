"""Fonte versionata della tassonomia; compatibilita con i CSV forniti alla CLI."""
import csv
import json
from pathlib import Path

TAXONOMY_COLUMNS = ['category_id', 'cluster_id', 'cluster_name', 'category_name', 'example_prompts', 'quota_status']
TAXONOMY_FILENAME = 'resources/taxonomy_it_v3_6_0.json'
LEGACY_TAXONOMY_FILENAME = 'tassonomia_word_association_it_172_categorie_v3_6_0.csv'
DEFAULT_TAXONOMY = Path(__file__).resolve().parent.parent / TAXONOMY_FILENAME


def read_taxonomy_rows(path):
    path = Path(path)
    if path.suffix.lower() == '.json':
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(data, dict) or data.get('format') != 'taxonomy-1' or data.get('columns') != TAXONOMY_COLUMNS:
            raise ValueError('Intestazione tassonomia JSON non valida')
        rows = data.get('categories')
        if not isinstance(rows, list): raise ValueError('Categorie della tassonomia non valide')
    else:
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            if list(reader.fieldnames or []) != TAXONOMY_COLUMNS:
                raise ValueError(f'Intestazione tassonomia non valida: {reader.fieldnames!r}')
            rows = list(reader)
    if any(not isinstance(row, dict) or set(row) != set(TAXONOMY_COLUMNS)
           or any(not isinstance(value, str) for value in row.values()) for row in rows):
        raise ValueError('Riga della tassonomia non valida')
    return rows
