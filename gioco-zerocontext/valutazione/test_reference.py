"""Riferimento raw 2.0 + Morph-it!: gruppi delle segrete, varianti, categoria, fuori riferimento, impronta."""
from contextlib import closing
from pathlib import Path
import os
import sqlite3
import tempfile
import unittest

from valutazione.reference import Reference, ReferenceChanged, load_reference

MORPHIT = '\n'.join([
    'cani\tcane\tNOUN-M:p', 'cane\tcane\tNOUN-M:s', 'abbaiare\tabbaiare\tVER:inf+pres',
    'bancaria\tbancaria\tNOUN-F:s', 'bancaria\tbancario\tADJ:pos+f+s', 'banche\tbanca\tNOUN-F:p',
    'banca\tbanca\tNOUN-F:s', 'porto\tporto\tNOUN-M:s', 'porta\tporta\tNOUN-F:s', 'bello\tbello\tADJ:pos+m+s',
    # Come in Morph-it! reale: porto e porta sono anche forme del verbo «portare» (omografi con lemma in comune).
    'porto\tportare\tVER:fin+pres+1+s', 'porta\tportare\tVER:fin+pres+3+s',
]) + '\n'

# (parola, ordinaria, speciale, legacy, deroga)
SECRETS = [('cane', 1, 0, 1, 0), ('gatto', 1, 0, 0, 0), ('abate', 0, 0, 1, 1), ('banca', 1, 0, 1, 0), ('porta', 1, 0, 1, 0)]
EXCLUSIONS = [('cani', 'cano'), ('pizze', 'pizza'), ('guinzagli', 'guinzaglio'), ('bancaria', 'bancario')]
LEMMAS = ['cane', 'gatto', 'abate', 'banca', 'porta', 'porto', 'guinzaglio', 'pizza', 'cano', 'bancario', 'abbaiare', 'bello']


def make_raw2(path: Path, secrets=SECRETS) -> None:
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE parole(parola TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL);
            CREATE TABLE normalizzata(parola TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL);
            CREATE TABLE normalizzazione_esclusioni(parola TEXT PRIMARY KEY, sostituita_da TEXT, motivo TEXT NOT NULL);
            CREATE TABLE parole_segrete(parola TEXT PRIMARY KEY, ordinaria INTEGER NOT NULL, speciale INTEGER NOT NULL,
                                        legacy INTEGER NOT NULL, deroga INTEGER NOT NULL);
        ''')
        con.executemany('INSERT INTO parole VALUES (?,1)', [(w,) for w in LEMMAS + [e[0] for e in EXCLUSIONS]])
        con.executemany('INSERT INTO normalizzata VALUES (?,1)', [(w,) for w in LEMMAS])
        con.executemany("INSERT INTO normalizzazione_esclusioni VALUES (?,?,'forma flessa')", EXCLUSIONS)
        con.executemany('INSERT INTO parole_segrete VALUES (?,?,?,?,?)', secrets)
        con.commit()


class ReferenceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raw2 = Path(self.tmp.name) / 'raw2.sqlite3'
        self.morphit = Path(self.tmp.name) / 'morphit.txt'
        make_raw2(self.raw2)
        self.morphit.write_text(MORPHIT, encoding='utf-8')
        self.ref = load_reference(self.raw2, self.morphit)

    def test_groups(self):
        self.assertEqual(self.ref.secrets, {'cane': 'ordinaria', 'gatto': 'aggiunta', 'abate': 'deroga',
                                            'banca': 'ordinaria', 'porta': 'ordinaria'})

    def test_secret_without_any_group_is_refused(self):
        bad = Path(self.tmp.name) / 'bad.sqlite3'
        make_raw2(bad, secrets=[('strana', 0, 0, 1, 0)])
        with self.assertRaises(ValueError):
            load_reference(bad, self.morphit)

    def test_variant_fixes_raw2_error(self):
        # raw 2.0 riconduce «cani» a «cano»; Morph-it! a «cane»: servono entrambe le fonti.
        self.assertEqual(self.ref.lemmas('cani') & {'cano', 'cane'}, {'cano', 'cane'})
        self.assertTrue(self.ref.is_variant('cani', 'cane'))

    def test_variant_from_morphit_only(self):
        self.assertTrue(self.ref.is_variant('banche', 'banca'))

    def test_derivative_of_the_secret(self):
        self.assertTrue(self.ref.is_variant('bancaria', 'banca'))

    def test_unrelated_words_are_not_variants(self):
        self.assertFalse(self.ref.is_variant('guinzaglio', 'cane'))
        self.assertFalse(self.ref.is_variant('cane', 'cane'))
        # Stessa radice ma parole diverse (porto / porta): la regola dei derivati non deve scattare.
        self.assertFalse(self.ref.is_variant('porto', 'porta'))

    def test_out_of_reference(self):
        self.assertFalse(self.ref.in_reference('beach'))
        self.assertTrue(self.ref.in_reference('pizze'))
        self.assertTrue(self.ref.in_reference('cane'))

    def test_pos(self):
        self.assertEqual(self.ref.pos('abbaiare'), 'VERB')
        self.assertEqual(self.ref.pos('cani'), 'NOUN')
        self.assertEqual(self.ref.pos('bello'), 'ADJ')
        self.assertEqual(self.ref.pos('xyz'), 'ALTRO')

    def test_changed_reference_is_detected(self):
        self.ref.check_unchanged()
        with closing(sqlite3.connect(self.raw2)) as con:
            con.execute("INSERT INTO parole_segrete VALUES ('nuova',1,0,0,0)")
            con.commit()
        with self.assertRaises(ReferenceChanged):
            self.ref.check_unchanged()

    def test_fingerprint_is_stable(self):
        self.assertEqual(self.ref.fingerprint(), load_reference(self.raw2, self.morphit).fingerprint())

    def test_opened_read_only(self):
        before = os.stat(self.raw2).st_mtime_ns
        load_reference(self.raw2, self.morphit).check_unchanged()
        self.assertEqual(os.stat(self.raw2).st_mtime_ns, before)
        self.assertEqual([p.name for p in Path(self.tmp.name).iterdir() if p.name.startswith('raw2.sqlite3-')], [])

    def test_missing_morphit_names_the_command(self):
        with self.assertRaises(FileNotFoundError) as caught:
            load_reference(self.raw2, Path(self.tmp.name) / 'assente.txt')
        self.assertIn('fetch_morphit.py', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
