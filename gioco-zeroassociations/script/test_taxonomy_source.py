import csv
import json
from pathlib import Path
import tempfile
import unittest

from taxonomy_source import DEFAULT_TAXONOMY, TAXONOMY_COLUMNS, read_taxonomy_rows
from validate_word_association_it_v3_6_0 import load_taxonomy


class TaxonomySourceTests(unittest.TestCase):
    def test_versioned_json_and_explicit_csv_have_identical_categories_and_checks(self):
        records = read_taxonomy_rows(DEFAULT_TAXONOMY)
        self.assertEqual(len(records), 172)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'taxonomy.csv'
            with path.open('w', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=TAXONOMY_COLUMNS)
                writer.writeheader(); writer.writerows(records)
            self.assertEqual(load_taxonomy(path), load_taxonomy(DEFAULT_TAXONOMY))

    def test_json_duplicates_are_not_hidden_by_a_dictionary(self):
        data = json.loads(DEFAULT_TAXONOMY.read_text(encoding='utf-8'))
        data['categories'][1] = dict(data['categories'][0])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'taxonomy.json'
            path.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'duplicato'):
                load_taxonomy(path)
