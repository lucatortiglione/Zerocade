"""Criteri scelti dall'utente: genere attestato e numero più comune."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from canonical_word_forms import FamilyEvidence, detect_canonical, features, select_families
from test_normalize_words import make


def form(gender, number):
    return {'gender': set(gender.split()), 'number': set(number.split()), 'sources': {'fixture'}}


class CanonicalTests(unittest.TestCase):
    def test_morphological_number_has_priority_over_contextual_mistag(self):
        evidence=FamilyEvidence({'stoviglia','stoviglie'})
        for word,pos in [('stoviglia','NOUN-F:s'),('stoviglie','NOUN-F:p')]:
            evidence.add('morphit-048-mirror','morphit',{
                'prompt':word,'lemma':'stoviglia','role':'lemma' if word=='stoviglia' else 'inflected_form',
                'pos':pos,'details':{}})
        evidence.add('ud-fixture','conllu',{'prompt':'stoviglie','lemma':'stoviglia','role':'inflected_form',
                     'pos':'NOUN','details':{'features':'Gender=Fem|Number=Sing'}})
        selected=evidence.finish({'stoviglia':1.4,'stoviglie':3.15}.__getitem__)
        self.assertEqual(selected,{'stoviglia':['stoviglie']})

    def test_dictionary_comparatives_do_not_replace_positive_degree(self):
        evidence=FamilyEvidence({'buono','buoni','migliore','migliori'})
        evidence.add('kaikki-itwiktionary','wiktextract',{
            'prompt':'buono','lemma':'buono','role':'lemma','pos':'adj',
            'details':{'entry_tags':['masculine','singular'],'forms':[
                {'form':'buoni','tags':['masculine','plural']},
                {'form':'migliore','tags':['comparative','masculine','singular']},
                {'form':'migliori','tags':['comparative','masculine','plural']}]}})
        for word,pos in [('migliore','ADJ:comp+m+s'),('migliori','ADJ:comp+m+p')]:
            evidence.add('morphit-048-mirror','morphit',{
                'prompt':word,'lemma':'buono','role':'inflected_form','pos':pos,'details':{}})
        selected=evidence.finish({'buono':6,'buoni':5,'migliore':4,'migliori':8}.__getitem__)
        self.assertNotIn('buono',selected)
        self.assertEqual(selected['migliore'],['migliori'])
        self.assertEqual(selected['buoni'],['buono'])

    def test_plural_wins_only_when_more_frequent_and_singular_wins_ties(self):
        family = {('stoviglia','NOUN'): {'stoviglia': form('Fem','Sing'), 'stoviglie': form('Fem','Plur')}}
        selected = select_families(family, set(), lambda w: {'stoviglia':1.4,'stoviglie':3.15}[w])
        self.assertEqual(selected, {'stoviglia':['stoviglie']})
        self.assertEqual(selected.evidence['stoviglia']['rule'], 'number_frequency')
        self.assertEqual(select_families(family, set(), lambda w: 2), {'stoviglie':['stoviglia']})

    def test_feminine_is_excluded_only_with_explicit_masculine_even_if_more_frequent(self):
        family = {('bello','ADJ'): {'bello':form('Masc','Sing'), 'bella':form('Fem','Sing')}}
        self.assertEqual(select_families(family, set(), lambda w: 6 if w=='bella' else 5), {'bella':['bello']})
        female_only = {('casa','NOUN'): {'casa':form('Fem','Sing'), 'case':form('Fem','Plur')}}
        self.assertEqual(select_families(female_only, set(), lambda w: 6 if w=='casa' else 4), {'case':['casa']})

    def test_gender_is_chosen_before_number_and_ambiguous_readings_stay(self):
        family = {('bello','ADJ'): {'bello':form('Masc','Sing'), 'belli':form('Masc','Plur'),
                                   'bella':form('Fem','Sing'), 'belle':form('Fem','Plur')}}
        scores = {'bello':2,'belli':4,'bella':5,'belle':6}
        selected = select_families(family, set(), scores.__getitem__)
        self.assertEqual(selected, {'bella':['belli'],'belle':['belli'],'bello':['belli']})
        self.assertNotIn('bella',select_families(family, {'bella'}, scores.__getitem__))

    def test_gender_change_in_plural_is_a_number_choice(self):
        family = {('uovo','NOUN'): {'uovo':form('Masc','Sing'), 'uova':form('Fem','Plur'), 'uovi':form('Masc','Plur')}}
        selected = select_families(family, set(), {'uova':5,'uovo':3,'uovi':1}.__getitem__)
        self.assertEqual(selected, {'uovo':['uova'],'uovi':['uova']})
        self.assertEqual(selected.evidence['uovo']['rule'], 'number_frequency')

    def test_feature_tags_and_database_links_do_not_use_word_endings(self):
        self.assertEqual(features('morphit-048-mirror','ADJ:pos+f+s',{}), ({'Fem'},{'Sing'}))
        self.assertEqual(features('unimorph-ita','ADJ',{'features':'ADJ;FEM;PL'}), ({'Fem'},{'Plur'}))
        self.assertEqual(features('ud-isdt-train','NOUN',{'features':'Gender=Masc|Number=Sing'}), ({'Masc'},{'Sing'}))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'raw.sqlite3'; make(path)
            with closing(sqlite3.connect(path)) as con, con:
                for tag, pos in enumerate(['NOUN-F:s','NOUN-F:p','ADJ:pos+m+s','ADJ:pos+f+s','VER:pres+ind+2+s'],1):
                    con.execute('INSERT INTO raw__inventory_attestation_pos VALUES (?,?)',(tag,pos))
                rows = [('stoviglia','stoviglia',1),('stoviglie','stoviglia',2),
                        ('bello','bello',3),('bella','bello',4),('banca','banca',1),
                        ('banco','banco',0),('voli','volo',0),('voli','volare',5)]
                for word, lemma, tag in rows:
                    con.execute("INSERT INTO raw__inventory_attestation_rows_json VALUES (0,?,'',0,?,?,?,'{}')",(word,tag,word,lemma))
                for word in {v for row in rows for v in row[:2]}:
                    con.execute('INSERT INTO raw__inventory_terms VALUES (?,1)',(word,))
            scores = {'stoviglia':1.4,'stoviglie':3.15,'bello':5,'bella':6,'voli':1,'volo':4}
            selected = detect_canonical(path, frequency=lambda w: scores.get(w,2))
            self.assertEqual(selected['stoviglia'], ['stoviglie'])
            self.assertEqual(selected['bella'], ['bello'])
            self.assertNotIn('banca',selected)
            self.assertNotIn('voli',selected)


if __name__ == '__main__':
    unittest.main()
