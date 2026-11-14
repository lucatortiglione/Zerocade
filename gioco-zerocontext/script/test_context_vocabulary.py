"""Regressioni sulla selezione delle nuove parole giocabili."""
from pathlib import Path
import sqlite3
import tempfile
import unittest

from context_vocabulary import accepted, inventory_vocab


class VocabularyTests(unittest.TestCase):
    def test_dependent_sources_do_not_supply_two_votes(self):
        self.assertFalse(accepted({'kaikki-itwiktionary'}))
        self.assertTrue(accepted({'kaikki-itwiktionary', 'kaikki-enwiktionary-it'}))
        self.assertTrue(accepted({'unimorph-ita'}))

    def test_active_lexical_sources_vectors_roles_and_word_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'inventory.sqlite3'
            con = sqlite3.connect(path)
            con.executescript('''
                CREATE TABLE raw__inventory_source_heads(source_key,snapshot_id);
                CREATE TABLE raw__inventory_snapshot_numbers(n,snapshot_id);
                CREATE TABLE raw__inventory_sources(source_key,kind);
                CREATE TABLE raw__inventory_registered_sources(source_key,enabled);
                CREATE TABLE raw__inventory_attestation_roles(n,role);
                CREATE TABLE raw__inventory_attestation_pos(n,pos);
                CREATE TABLE raw__inventory_attestation_rows(prompt,snapshot,role,pos);
                INSERT INTO raw__inventory_attestation_roles VALUES
                    (1,'lemma'),(2,'inflected_form'),(3,'proper_name'),(4,'frequency_form'),(5,'unverified_title');
                INSERT INTO raw__inventory_attestation_pos VALUES (1,'noun'),(2,'V'),(3,'Npms');
            ''')
            sources = [('unimorph-ita','unimorph',1), ('kaikki-itwiktionary','wiktextract',1),
                       ('glaffit','glaffit',1), ('kaikki-enwiktionary-it','wiktextract',1),
                       ('disabled','morphit',0), ('wikipedia-it','wiki_titles',1)]
            for n, (key, kind, enabled) in enumerate(sources, 1):
                con.execute('INSERT INTO raw__inventory_source_heads VALUES (?,?)', (key,str(n)))
                con.execute('INSERT INTO raw__inventory_snapshot_numbers VALUES (?,?)', (n,str(n)))
                con.execute('INSERT INTO raw__inventory_sources VALUES (?,?)', (key,kind))
                con.execute('INSERT INTO raw__inventory_registered_sources VALUES (?,?)', (key,enabled))
            con.executemany('INSERT INTO raw__inventory_attestation_rows VALUES (?,?,?,?)', [
                ('andassero',1,2,2), ('lessico',2,1,1), ('lessico',4,1,1),
                ('debole',2,1,1), ('debole',3,1,1),  # GLAFF deriva da Wikizionario IT
                ('assente',1,1,1), ('storico',99,1,1), ('spento',5,1,1),
                ('proprio',1,3,1), ('proprio',3,1,3), ('frequenza',1,4,1),
                ('titolo',6,1,1), ('titolo',1,5,1),
                ('ape',1,1,1), ('a'*16,1,1,1), ('a'*17,1,1,1), ('a'*2,1,1,1),
                ('città',1,1,1), ('due parole',1,1,1)])
            con.commit(); con.close()
            index = {w: i for i,w in enumerate(['andassero','lessico','debole','storico','spento',
                'proprio','frequenza','titolo','ape','a'*16,'a'*17,'a'*2,'città','due parole'])}
            selected, snapshots = inventory_vocab(index, path)
            self.assertEqual(set(selected), {'andassero','lessico','ape','a'*16,'città'})
            self.assertEqual(selected['lessico'], ['kaikki-enwiktionary-it','kaikki-itwiktionary'])
            self.assertEqual(len(snapshots), 4)
            con = sqlite3.connect(path)
            count = con.execute('SELECT count(*) FROM raw__inventory_attestation_rows').fetchone()[0]
            con.close()
            self.assertEqual(count, 19)


if __name__ == '__main__': unittest.main()
