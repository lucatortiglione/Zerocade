"""Scelta delle forme canoniche con genere attestato e frequenza del numero."""
from collections import defaultdict
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

from inventory_evidence import upos
from raw_word_cleaning import clean_word


class Selections(dict):
    """Forma esclusa -> rappresentante; motivi riproducibili per il registro."""
    def __init__(self):
        super().__init__()
        self.reasons = {}
        self.evidence = {}


def features(source, pos, details):
    """Solo tratti espliciti: nessuna inferenza dalla desinenza della parola."""
    gender, number = set(), set()
    if source == 'morphit-048-mirror':
        if pos.startswith('NOUN-'):
            if pos.startswith('NOUN-M:'): gender.add('Masc')
            if pos.startswith('NOUN-F:'): gender.add('Fem')
        elif pos.startswith('ADJ:'):
            if re.search(r'[:+]m(?:\+|$)', pos): gender.add('Masc')
            if re.search(r'[:+]f(?:\+|$)', pos): gender.add('Fem')
        if pos.startswith(('NOUN-', 'ADJ:')):
            if pos.endswith((':s', '+s')): number.add('Sing')
            if pos.endswith((':p', '+p')): number.add('Plur')
    elif source == 'glaffit' and pos in {'Ncms','Ncfs','Ncmp','Ncfp','Afpms','Afpfs','Afpmp','Afpfp'}:
        gender.add('Masc' if pos[-2] == 'm' else 'Fem')
        number.add('Sing' if pos[-1] == 's' else 'Plur')
    elif source.startswith('flex-it'):
        gender.update({'m':'Masc','masc':'Masc','f':'Fem','fem':'Fem'}.get(str(details.get('gender','')).lower(), '').split())
        number.update({'sing':'Sing','sg':'Sing','plur':'Plur','pl':'Plur'}.get(str(details.get('number','')).lower(), '').split())
    elif source.startswith(('ud-', 'unimorph')):
        tags = set(re.split(r'[;|]', details.get('features') or ''))
        if tags & {'Gender=Masc','MASC'}: gender.add('Masc')
        if tags & {'Gender=Fem','FEM'}: gender.add('Fem')
        if tags & {'Number=Sing','SG'}: number.add('Sing')
        if tags & {'Number=Plur','PL'}: number.add('Plur')
    elif source.startswith('kaikki'):
        senses = details.get('senses') or []
        tags = set(details.get('entry_tags') or []) | {t for s in senses for t in s.get('tags', [])}
        if tags & {'masculine','male'}: gender.add('Masc')
        if tags & {'feminine','female'}: gender.add('Fem')
        if 'singular' in tags: number.add('Sing')
        if 'plural' in tags: number.add('Plur')
    return gender, number


def select_families(families, ambiguous, frequency):
    out = Selections()
    proposals = defaultdict(list)
    for key, forms in sorted(families.items()):
        lemma, category = key[:2]
        if len(forms) < 2:
            continue
        males = {w for w, d in forms.items() if d['gender'] == {'Masc'}}
        females = {w for w, d in forms.items() if d['gender'] == {'Fem'}}
        # Uova/uovo cambia genere con il numero: non è una variante femminile
        # parallela. Il genere si confronta fra forme dello stesso numero.
        paired_gender = any(forms[m]['number'] & forms[f]['number'] for m in males for f in females)
        heteroclitic = (category=='NOUN' and any('Sing' in forms[m]['number'] for m in males)
                       and not any('Sing' in forms[f]['number'] for f in females))
        feminine_variants = females if paired_gender and not heteroclitic else set()
        eligible = set(forms) - feminine_variants
        singular = {w for w in eligible if 'Sing' in forms[w]['number']}
        plural = {w for w in eligible if 'Plur' in forms[w]['number']}
        # Un lemma attestato senza numero non autorizza a inventarne la flessione.
        candidates = singular | plural
        if not candidates:
            continue
        scores = {w: float(frequency(w)) for w in forms}
        winner = max(sorted(candidates), key=lambda w: (scores[w], w in singular))
        for word in forms:
            if word == winner or word in ambiguous:
                continue
            feminine = word in feminine_variants
            same_gender = word in eligible
            different_number = ((forms[word]['number'] == {'Sing'} and forms[winner]['number'] == {'Plur'})
                                or (forms[word]['number'] == {'Plur'} and forms[winner]['number'] == {'Sing'}))
            inferior_plural = (forms[word]['number']==forms[winner]['number']=={'Plur'} and singular
                               and scores[word]<=max(scores[s] for s in singular))
            if not feminine and winner in ambiguous:
                continue
            if not feminine and not (same_gender and (different_number or inferior_plural)):
                continue
            reason = ('Variante femminile: esiste un equivalente maschile attestato' if feminine
                      else 'Variante di numero: si preferisce la forma di uso più comune; a parità il singolare')
            record = {'canonical': winner, 'lemma': lemma, 'pos': category,
                      'zipf_form': scores[word], 'zipf_canonical': scores[winner],
                      'form_gender':sorted(forms[word]['gender']),'form_number':sorted(forms[word]['number']),
                      'canonical_gender':sorted(forms[winner]['gender']),'canonical_number':sorted(forms[winner]['number']),
                      'sources': sorted(forms[word]['sources'] | forms[winner]['sources']),
                      'rule': 'feminine_with_masculine' if feminine else 'number_frequency'}
            proposals[word].append((winner, reason, record))
    for word, choices in sorted(proposals.items()):
        if len({v[0] for v in choices}) != 1:
            continue
        winner, reason, record = choices[0]
        # Evita esclusioni a catena/cicli quando fonti diverse collegano famiglie diverse.
        if winner in proposals:
            continue
        out[word] = [winner]
        out.reasons[word] = f"{reason}; si tiene {winner} (Zipf {record['zipf_canonical']:.2f} vs {record['zipf_form']:.2f})"
        out.evidence[word] = record
    return out


def is_infinitive(source, pos, details):
    """L'infinito dichiarato dalla fonte; il lemma di un verbo è comunque trattato come infinito."""
    if source == 'morphit-048-mirror':
        return pos.upper().startswith('VER:INF')
    if source == 'glaffit':
        return pos.startswith('Vmn')
    if source.startswith('ud-'):
        return 'VerbForm=Inf' in (details.get('features') or '').split('|')
    if source.startswith('unimorph'):
        return 'NFIN' in re.split(r'[;.]', pos + ';' + (details.get('features') or ''))
    if source.startswith('kaikki'):
        senses = details.get('senses') or []
        return 'infinitive' in (set(details.get('entry_tags') or []) | {t for x in senses for t in x.get('tags', [])})
    return False


class FamilyEvidence:
    """Accumula prove dai file originali; separa positivo/comparativo/superlativo."""
    def __init__(self, known):
        self.known = known
        self.families = defaultdict(dict)
        self.readings = defaultdict(set)
        self.gender_aliases = defaultdict(set)
        self.number_aliases = defaultdict(set)
        # parola -> bit: 1 forma verbale non all'infinito, 2 infinito o lemma verbale, 4 altra categoria o categoria ignota.
        self.verb_marks = defaultdict(int)
        self.verb_lemmas = defaultdict(set)

    @staticmethod
    def node():
        return {'gender':set(),'number':set(),'sources':set(),'gender_rank':-1,'number_rank':-1}

    @staticmethod
    def merge_traits(target,g,n,gender_rank,number_rank=None):
        for field,values,rank in (('gender',g,gender_rank),('number',n,gender_rank if number_rank is None else number_rank)):
            if values and rank>target[field+'_rank']:
                target[field]=set(values); target[field+'_rank']=rank
            elif values and rank==target[field+'_rank']:
                target[field].update(values)

    def note_verb(self, source, kind, word, lemma, role, pos, details):
        """Traccia se la parola è attestata solo come forma verbale diversa dall'infinito."""
        category = upos(kind,pos,role)
        if category not in {'VERB','AUX'}:
            self.verb_marks[word] |= 4
        elif role!='inflected_form' or word==lemma or is_infinitive(source,pos,details):
            self.verb_marks[word] |= 2
        else:
            self.verb_marks[word] |= 1
            if lemma:
                self.verb_lemmas[word].add(lemma)

    def add(self, source, kind, row):
        word, lemma, role, pos = clean_word(row['prompt']),clean_word(row['lemma']),row['role'],row['pos']
        if word in self.known:
            self.note_verb(source,kind,word,lemma,role,pos,row.get('details') or {})
        if word not in self.known or role not in {'lemma','inflected_form'}:
            return
        details = row.get('details') or {}
        if details.get('source_scope') == 'explicit_lemma':
            return
        category = upos(kind,pos,role)
        if category and category not in {'NOUN','ADJ','PROPN'}:
            self.readings[word].add(category)
        if category not in {'NOUN','ADJ'} or lemma not in self.known:
            return
        self.readings[word].add((lemma,category))
        g,n = features(source,pos,details)
        rank = 5 if kind in {'morphit','flex_it'} else 4 if kind in {'unimorph','wiktextract'} else 3 if kind=='glaffit' else 1
        degree = 'Pos'
        if category == 'ADJ':
            tags = set(re.split(r'[;|]',details.get('features') or '')) | set(details.get('entry_tags') or [])
            tags.update(t for sense in details.get('senses') or [] for t in sense.get('tags') or [])
            if ':sup' in pos or tags & {'Degree=Sup','SPRL','SUP','superlative'}:
                degree = 'Sup'
            elif ':comp' in pos or tags & {'Degree=Cmp','CMPR','CMP','comparative'}:
                degree = 'Cmp'
        family = self.families[(lemma,category,degree)]
        family.setdefault(lemma,self.node())
        if word!=lemma and n=={'Plur'} and degree=='Pos':
            self.merge_traits(family[lemma],set(),{'Sing'},0)
            family[lemma]['sources'].add(source)
        form = family.setdefault(word,self.node())
        self.merge_traits(form,g,n,rank); form['sources'].add(source)
        if source.startswith('kaikki'):
            for variant in details.get('forms') or []:
                name = clean_word(str(variant.get('form','')))
                if name not in self.known:
                    continue
                tags = set(variant.get('tags') or [])
                variant_degree = ('Sup' if 'superlative' in tags else 'Cmp' if 'comparative' in tags else degree)
                if variant_degree != degree:
                    continue
                if not tags & {'masculine','feminine','male','female','singular','plural'}:
                    continue
                vg,vn = features(source,pos,{'entry_tags':list(tags)})
                if not vg: vg = g.copy()
                if not vn and tags & {'masculine','feminine','male','female'} and n=={'Sing'}:
                    vn = {'Sing'}
                target = family.setdefault(name,self.node())
                self.merge_traits(target,vg,vn,rank); target['sources'].add(source)
                self.readings[name].add((lemma,category))
                if word==lemma and name!=word and n==vn=={'Sing'} and {frozenset(g),frozenset(vg)}=={frozenset({'Masc'}),frozenset({'Fem'})}:
                    male,female = (word,name) if g=={'Masc'} else (name,word)
                    self.gender_aliases[(female,category)].add(male)
                if word==lemma and name!=word and ((n=={'Sing'} and vn=={'Plur'}) or (n=={'Plur'} and vn=={'Sing'})):
                    singular,plural = (word,name) if n=={'Sing'} else (name,word)
                    self.number_aliases[(plural,category)].add(singular)

    def finish(self,frequency=None):
        if frequency is None:
            from wordfreq import zipf_frequency
            frequency = lambda w:zipf_frequency(w,'it')
        def canonical(lemma,category,seen=frozenset()):
            if lemma in seen:
                return lemma
            targets = self.gender_aliases.get((lemma,category),()) or self.number_aliases.get((lemma,category),())
            if not targets:
                return lemma
            resolved = {canonical(t,category,seen|{lemma}) for t in targets}
            return next(iter(resolved)) if len(resolved)==1 else lemma
        merged = defaultdict(dict)
        for (lemma,category,degree),forms in self.families.items():
            family = merged[(canonical(lemma,category),category,degree)]
            for word,attrs in forms.items():
                target = family.setdefault(word,self.node())
                self.merge_traits(target,attrs['gender'],attrs['number'],attrs['gender_rank'],attrs['number_rank'])
                target['sources'].update(attrs['sources'])
        ambiguous = set()
        for word,readings in self.readings.items():
            if any(isinstance(v,str) for v in readings):
                ambiguous.add(word)
            lemmas = {(canonical(v[0],v[1]),v[1]) for v in readings if isinstance(v,tuple)}
            if len({v[0] for v in lemmas if v[0]!=canonical(word,v[1])})>1:
                ambiguous.add(word)
        out = select_families(merged,ambiguous,frequency)
        return self.exclude_verb_forms(out)

    def exclude_verb_forms(self, out):
        """Toglie le parole attestate solo come forme verbali diverse dall'infinito (coniugate, participi, gerundi).
        Una forma attestata anche come nome, aggettivo, avverbio o altro, o come infinito, resta."""
        verbs = sorted(w for w,m in self.verb_marks.items() if m==1 and w not in out)
        gone = set(verbs)
        for word in verbs:
            lemmas = sorted(self.verb_lemmas[word])
            replacement = [l for l in lemmas if l in self.known and l not in gone and l not in out and l!=word]
            out[word] = replacement[:1]
            out.reasons[word] = "Forma verbale diversa dall'infinito" +(f'; infinito: {replacement[0]}' if replacement else '')
            out.evidence[word] = {'rule':'verb_form','lemmas':lemmas,'pos':'VERB'}
        return out


def detect_canonical(path, frequency=None):
    if frequency is None:
        from wordfreq import zipf_frequency
        frequency = lambda word: zipf_frequency(word, 'it')
    families = defaultdict(dict)
    readings = defaultdict(set)
    with closing(sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True)) as con:
        con.execute('BEGIN')
        known = {w for w, in con.execute('SELECT prompt FROM raw__inventory_terms WHERE is_single_word=1')}
        active = con.execute("SELECT 1 FROM sqlite_schema WHERE name='raw__inventory_source_heads'").fetchone()
        if active:
            sources = dict(con.execute('''SELECT n.n,h.source_key FROM raw__inventory_source_heads h
                JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=h.snapshot_id'''))
        else:
            sources = dict(con.execute('''SELECT n.n,s.source_key FROM raw__inventory_snapshot_numbers n
                JOIN raw__inventory_snapshots s ON s.id=n.snapshot_id'''))
        sources = {n:s for n,s in sources.items() if s.startswith(('morphit','glaffit','flex-it','ud-','unimorph','kaikki'))}
        if not sources:
            return Selections()
        roles = dict(con.execute('SELECT n,role FROM raw__inventory_attestation_roles'))
        tags = dict(con.execute('SELECT n,pos FROM raw__inventory_attestation_pos'))
        for word, snapshot, role, tag, lemma, raw in con.execute(f'''SELECT prompt,snapshot,role,pos,lemma,details_json
                FROM raw__inventory_attestation_rows_json WHERE snapshot IN ({','.join('?' for _ in sources)})''', tuple(sources)):
            if word not in known or roles[role] not in {'lemma','inflected_form'}:
                continue
            source, pos = sources[snapshot], tags[tag]
            kind = ('glaffit' if source=='glaffit' else 'wiktextract' if source.startswith('kaikki')
                    else 'flex_it' if source.startswith('flex-it') else 'morphit')
            category = upos(kind, pos, roles[role])
            detail = json.loads(raw or '{}')
            if detail.get('source_scope') == 'explicit_lemma':
                continue  # Il tag della forma osservata non descrive il genere/numero del lemma.
            if category and category not in {'NOUN','ADJ','PROPN'}:
                readings[word].add(category)
            if category not in {'NOUN','ADJ'} or lemma not in known:
                continue
            readings[word].add((lemma,category))
            g, n = features(source, pos, detail)
            family = families[(lemma,category)]
            family.setdefault(lemma, {'gender':set(), 'number':set(), 'sources':set()})
            if word != lemma and n == {'Plur'}:
                # Il lemma esplicito del plurale attesta il corrispondente singolare;
                # non ne eredita il genere (uova/uovo è un controesempio).
                family[lemma]['number'].add('Sing')
                family[lemma]['sources'].add(source)
            form = family.setdefault(word, {'gender':set(), 'number':set(), 'sources':set()})
            form['gender'].update(g); form['number'].update(n); form['sources'].add(source)
    ambiguous = {w for w, r in readings.items() if any(isinstance(v,str) for v in r)
                 or len({v for v in r if isinstance(v,tuple) and v[0]!=w}) > 1}
    return select_families(families, ambiguous, frequency)
