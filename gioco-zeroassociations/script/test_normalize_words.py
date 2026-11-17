"""La normalizzazione: i plurali puri diventano decisioni DISCARDED, senza toccare quelle prese da altri."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import normalize_words as n


def make(path: Path):
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE raw__inventory_snapshots(id TEXT, source_key TEXT);
            CREATE TABLE raw__inventory_snapshot_numbers(n INTEGER, snapshot_id TEXT);
            CREATE TABLE raw__inventory_attestation_roles(n INTEGER, role TEXT);
            CREATE TABLE raw__inventory_attestation_pos(n INTEGER, pos TEXT);
            CREATE TABLE raw__inventory_attestation_rows_json(snapshot, prompt, locator, role, pos, source_form, lemma, details_json);
            CREATE TABLE raw__inventory_terms(prompt TEXT, is_single_word INTEGER);
            CREATE TABLE raw__inventory_term_decisions(prompt TEXT PRIMARY KEY, decision TEXT NOT NULL, reason TEXT NOT NULL,
              actor TEXT NOT NULL, decided_at TEXT NOT NULL) STRICT;
            CREATE TABLE raw__inventory_decision_history(id INTEGER PRIMARY KEY, subject_type TEXT, subject_id TEXT, decision TEXT,
              reason TEXT, actor TEXT, decided_at TEXT) STRICT;
            INSERT INTO raw__inventory_snapshots VALUES ('s', 'morphit-048-mirror');
            INSERT INTO raw__inventory_snapshot_numbers VALUES (0, 's');
            INSERT INTO raw__inventory_attestation_roles VALUES (0, 'inflected_form');
            INSERT INTO raw__inventory_attestation_pos VALUES (0, 'NOUN-M:p');''')
        for plural, singular in [('gatti', 'gatto'), ('case', 'casa'), ('cani', 'cane')]:
            con.execute("INSERT INTO raw__inventory_attestation_rows_json VALUES ('0', ?, '', 0, 0, ?, ?, ?)",
                        (plural, plural, singular, json.dumps({})))
        # Il numero di snapshot e i codici sono interi nella vista vera: qui snapshot è 0.
        con.execute("UPDATE raw__inventory_attestation_rows_json SET snapshot = 0")
        con.executemany('INSERT INTO raw__inventory_terms VALUES (?, 1)', [(w,) for w in ('gatti', 'gatto', 'case', 'casa', 'cani', 'cane')])
        con.execute("INSERT INTO raw__inventory_term_decisions VALUES ('cani', 'DEFERRED', 'da rivedere', 'persona', 'x')")
        con.execute("INSERT INTO raw__inventory_term_decisions VALUES ('vecchi', 'DISCARDED', 'x', ?, 'x')", (n.ACTOR,))
        con.commit()


class NormalizeTests(unittest.TestCase):
    def test_records_new_plurals_leaves_other_decisions_and_withdraws_its_own(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'raw.sqlite3'
            make(path)
            plurals = n.detect(path, frequency=lambda w: 5 if w in {'gatto','casa','cane'} else 2)
            self.assertEqual(plurals, {'case': ['casa'], 'cani': ['cane'], 'gatti': ['gatto']})
            p = n.plan(path, plurals)
            self.assertEqual((p['new'], p['kept_manual'], p['withdrawn']), (['case', 'gatti'], ['cani'], ['vecchi']))
            self.assertEqual(n.apply(path, plurals), {'recorded': 2, 'withdrawn': 1})
            with closing(sqlite3.connect(path)) as con:
                rows = dict((w, (d, r)) for w, d, r in con.execute('SELECT prompt, decision, reason FROM raw__inventory_term_decisions'))
                self.assertEqual(rows['gatti'][0], 'DISCARDED')
                self.assertIn('si tiene gatto', rows['gatti'][1])
                self.assertEqual(rows['cani'][0], 'DEFERRED')
                self.assertNotIn('vecchi', rows)
                self.assertEqual(con.execute('SELECT count(*) FROM raw__inventory_decision_history').fetchone()[0], 3)
            # Rilanciata: niente di nuovo.
            self.assertEqual(n.apply(path, plurals), {'recorded': 0, 'withdrawn': 0})


if __name__ == '__main__':
    unittest.main()
