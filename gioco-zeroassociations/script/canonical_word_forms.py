"""Scelta delle forme canoniche: per nomi e aggettivi si tiene il lemma e si scartano le sue forme flesse (17/11/2026).

Prima (16/11/2026) il numero si sceglieva per frequenza (stoviglie batteva stoviglia): ora la forma flessa lascia
sempre il posto al lemma attestato. Comparativi e superlativi restano famiglie distinte, rappresentate dal maschile
singolare. La frequenza decide solo quando il lemma non è nella famiglia."""
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


GENDER_MARGIN = 0.5  # Zipf in più che un lemma deve avere sul rappresentante per diventare il rappresentante del gruppo
FEMININE_HOMOGRAPH_MARGIN = 2.0  # Zipf in più che un femminile deve avere sul presunto maschile per essere una parola a sé (cosa/coso, persona/delatore)
HOMOGRAPH_MARGIN = 1.0  # Zipf in più che una parola deve avere sul lemma di cui è anche un plurale per restare un lemma a sé (parte, mente)
PLURAL_MARGIN = 1.0  # Zipf in più che il plurale deve avere sul singolare per essere la forma tenuta (stoviglie, 18/11/2026)


def select_families(families, ambiguous, frequency, lemma_conflicts=None):
    # `ambiguous`: forme con più letture (anche verbali) che restano. `lemma_conflicts`: forme con più lemmi nominali/aggettivali; solo un
    # rappresentante di questo tipo blocca la sua famiglia (un lemma che è anche gerundio, come specializzando, no).
    lemma_conflicts = ambiguous if lemma_conflicts is None else lemma_conflicts
    out = Selections()
    proposals = defaultdict(list)
    for key, forms in sorted(families.items()):
        lemma, category = key[:2]
        degree = key[2] if len(key) > 2 else 'Pos'
        if len(forms) < 2:
            continue
        males = {w for w, d in forms.items() if d['gender'] == {'Masc'}}
        females = {w for w, d in forms.items() if d['gender'] == {'Fem'}}
        # Uova/uovo cambia genere con il numero: non è una variante femminile
        # parallela. Il genere si confronta fra forme dello stesso numero.
        paired_gender = any(forms[m]['number'] & forms[f]['number'] for m in males for f in females)
        heteroclitic = (category=='NOUN' and any('Sing' in forms[m]['number'] for m in males)
                       and not any('Sing' in forms[f]['number'] for f in females))
        scores = {w: float(frequency(w)) for w in forms}
        # Fra maschile e femminile si tiene la forma più comune (17/11/2026: massaia, non massaio); a parità, o con una
        # differenza inferiore a GENDER_MARGIN, il maschile. Le forme dell'altro genere sono varianti da scartare.
        variants = set()
        if paired_gender and not heteroclitic:
            # Regola del 18/11/2026: il maschile, oppure il femminile solo se un maschile equivalente non esiste. Un femminile molto più
            # comune del presunto maschile (persona/delatore, strada/stradino, cosa/coso) è una parola a sé: le fonti li legano per una
            # forma rara e la famiglia non è una coppia di genere.
            def best(group):
                singular_group = [w for w in group if 'Sing' in forms[w]['number']] or list(group)
                return max((scores[w] for w in singular_group), default=0.0)
            variants = set() if best(females) >= best(males) + FEMININE_HOMOGRAPH_MARGIN else females
        feminine_variants = variants
        eligible = set(forms) - feminine_variants
        singular = {w for w in eligible if 'Sing' in forms[w]['number']}
        plural = {w for w in eligible if 'Plur' in forms[w]['number']}
        # Grado positivo: il lemma della famiglia è il rappresentante e ogni sua forma flessa si scarta.
        # Un lemma dell'altro genere non vince: si tiene la forma più comune fra maschile e femminile (17/11/2026).
        by_lemma = degree == 'Pos' and lemma in forms and lemma not in feminine_variants
        if by_lemma:
            winner = lemma
        else:
            # Un lemma attestato senza numero non autorizza a inventarne la flessione.
            candidates = singular | plural
            if not candidates:
                continue
            # Comparativo/superlativo, o lemma assente dalla famiglia: il maschile singolare, poi la frequenza.
            winner = max(sorted(candidates), key=lambda w: (w in singular, forms[w]['gender'] != {'Fem'}, scores[w]))
        for word in forms:
            if word == winner or word in ambiguous:
                continue
            feminine = word in feminine_variants
            if not feminine and winner in lemma_conflicts:
                continue
            # Solo una forma con genere o numero attestati è una forma flessa: una variante senza tratti
            # (grafia alternativa, annotazione incompleta) resta per la revisione.
            if not (forms[word]['gender'] or forms[word]['number']):
                continue
            if not by_lemma:
                same_gender = word in eligible
                different_number = ((forms[word]['number'] == {'Sing'} and forms[winner]['number'] == {'Plur'})
                                    or (forms[word]['number'] == {'Plur'} and forms[winner]['number'] == {'Sing'}))
                same_number = forms[word]['number'] == forms[winner]['number'] and bool(forms[word]['number'])
                if not feminine and not (same_gender and (different_number or same_number)):
                    continue
            gender_rule = 'feminine_with_masculine' if forms[word]['gender']=={'Fem'} else 'masculine_with_feminine'
            reason = (('Variante femminile: esiste un equivalente maschile attestato' if gender_rule=='feminine_with_masculine'
                       else 'Variante maschile: il femminile è nettamente più comune') if feminine
                      else 'Forma flessa: si tiene il lemma' if by_lemma
                      else 'Forma flessa di comparativo o superlativo: si tiene il maschile singolare')
            record = {'canonical': winner, 'lemma': lemma, 'pos': category,
                      'zipf_form': scores[word], 'zipf_canonical': scores[winner],
                      'form_gender':sorted(forms[word]['gender']),'form_number':sorted(forms[word]['number']),
                      'canonical_gender':sorted(forms[winner]['gender']),'canonical_number':sorted(forms[winner]['number']),
                      'sources': sorted(forms[word]['sources'] | forms[winner]['sources']),
                      'rule': gender_rule if feminine else 'inflected_form' if by_lemma else 'degree_form'}
            proposals[word].append((winner, reason, record))
    for word, choices in sorted(proposals.items()):
        if len({v[0] for v in choices}) != 1:
            continue
        winner, reason, record = choices[0]
        # Evita esclusioni a catena/cicli quando fonti diverse collegano famiglie diverse.
        if winner in proposals:
            continue
        out[word] = [winner]
        out.reasons[word] = f"{reason}; si tiene {winner} (Zipf {record['zipf_canonical']:.2f}, forma esclusa {record['zipf_form']:.2f})"
        out.evidence[word] = record
    return out


def regular_participles(verb):
    """Participi passati regolari di un infinito: specializzare → specializzato. Serve a riconoscere l'aggettivo omografo."""
    if verb.endswith('are'):
        return {verb[:-3]+'ato'}
    if verb.endswith('ere'):
        return {verb[:-3]+'uto', verb[:-3]+'ito'}
    if verb.endswith('ire'):
        return {verb[:-3]+'ito'}
    return set()


def is_participle(source, pos, details):
    """Il participio dichiarato dalla fonte: l'aggettivo omografo (specializzata) resta la lettura che conta per la famiglia."""
    if source == 'morphit-048-mirror':
        return pos.upper().startswith('VER:PART')
    if source == 'glaffit':
        return pos.startswith('Vmp')
    if source.startswith('ud-'):
        return 'VerbForm=Part' in (details.get('features') or '').split('|')
    if source.startswith('unimorph'):
        return 'V.PTCP' in (pos + ';' + (details.get('features') or ''))
    if source.startswith('kaikki'):
        senses = details.get('senses') or []
        return 'participle' in (set(details.get('entry_tags') or []) | {t for x in senses for t in x.get('tags', [])})
    return False


def is_infinitive(source, pos, details):
    """L'infinito dichiarato dalla fonte; il lemma di un verbo è comunque trattato come infinito."""
    if source == 'morphit-048-mirror':
        # Solo l'infinito semplice («VER:inf+pres»): con una particella («VER:inf+pres+gliela», offrirgliela) è una forma
        # composta, non l'infinito.
        return re.fullmatch(r'VER:INF\+[A-Z]+', pos.upper()) is not None
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
        elif source.startswith('kaikki') and 'compound-of' in (set(details.get('entry_tags') or []) |
                                                              {t for s in details.get('senses') or [] for t in s.get('tags', [])}):
            # Wiktionary: verbo con particelle (offrendoci, offrirgliela), indicato come composto e non come forma flessa.
            self.verb_marks[word] |= 1
        elif role=='inflected_form' and lemma and lemma==word+'e' and lemma.endswith('re'):
            # Infinito troncato (specializzar, andar): una forma verbale del suo infinito, non un infinito a sé.
            self.verb_marks[word] |= 1
            self.verb_lemmas[word].add(lemma)
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
            # Un participio non è una lettura diversa da quella dell'aggettivo omografo (specializzata: specializzato/specializzare).
            if not (category in {'VERB','AUX'} and is_participle(source,pos,details)):
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

    # Controlli di riferimento (18/11/2026): parola → 'kept' (resta in normalizzata) o 'excluded'. Si verificano solo se le parole sono nella raccolta.
    REFERENCE_CHECKS = {
        'parto':'kept','parte':'kept','parti':'excluded','parta':'excluded',          # omografi: parte è anche plurale di parta/parto
        'menta':'kept','mente':'kept','menti':'excluded','mento':'kept',
        'stoviglie':'kept','stoviglia':'excluded',                                   # plurale più comune
        'sposo':'kept','sposa':'excluded','massaio':'kept','massaia':'excluded',     # maschile sempre, se esiste
        'casa':'kept','case':'excluded','ragazzo':'kept','ragazza':'excluded','ragazzi':'excluded',
        'specializzato':'kept','specializzata':'excluded','specializzando':'kept','specializzandi':'excluded','specializzar':'excluded',
        'offrire':'kept','offrirgliela':'excluded','offrendoci':'excluded','lavarsi':'excluded',
        'onesto':'kept','onestissimo':'excluded','onestissima':'excluded','ottimo':'kept',      # superlativo regolare out, irregolare resta
    }


    COMMON_WORD_ZIPF = 4.5  # sopra questa frequenza una parola con un lemma proprio di più fonti è una parola a sé (porta, volta)

    def is_homograph(self, word, readings, frequency):
        """Una parola che è un lemma a sé ed è anche una forma flessa (plurale o femminile) di un altro lemma resta, se vale uno di questi
        segnali (cane/cano, sole/solo, rosa/roso, porta/porto, parte/parta, mente/menta, cosa/coso):
        1. tutte le sue letture da forma flessa stanno in una categoria diversa da quella del suo lemma (rosa nome contro roso aggettivo) e il
           suo lemma ha almeno due fonti;
        2. è un nome maschile e l'altra lettura è un femminile plurale (cane, sole);
        3. è più comune del lemma di cui è plurale di almeno HOMOGRAPH_MARGIN, salvo il plurale più comune di un singolare raro (stoviglie);
        4. è un femminile singolare più comune del presunto maschile di almeno FEMININE_HOMOGRAPH_MARGIN (cosa, persona, idea, famiglia).
        Un vero femminile di un maschile della stessa categoria e di frequenza vicina (sposa/sposo, cassiera/cassiere) non è un omografo."""
        own_categories = {v[1] for v in readings if isinstance(v,tuple) and v[0]==word}
        if not own_categories:
            return False
        inflected = []   # (lemma, categoria, è plurale)
        for v in readings:
            if isinstance(v,tuple) and v[0]!=word:
                d = self.families.get((v[0],v[1],'Pos'),{}).get(word)
                if d and ('Plur' in d['number'] or d['gender']=={'Fem'}):
                    inflected.append((v[0],v[1],d['number']=={'Plur'},d['gender']=={'Fem'}))
        if not inflected:
            return False
        # Il lemma proprio deve avere un peso indipendente: almeno due fonti (un nome tagliato da una sola fonte, funesta, non basta).
        strong = {c for c in own_categories if len(self.families.get((word,c,'Pos'),{}).get(word,{}).get('sources',()))>=2}
        word_zipf = float(frequency(word))
        if strong and all(category not in strong for _,category,_,_ in inflected):
            # Per un femminile singolare la sola categoria non basta (abbandonata, agonistica restano forme di participi e aggettivi):
            # serve una parola molto comune (porta, volta, rosa) o nettamente più comune del lemma.
            if all(plural or word_zipf>=self.COMMON_WORD_ZIPF or word_zipf-float(frequency(lemma))>=HOMOGRAPH_MARGIN
                   for lemma,_,plural,_ in inflected):
                return True                                                  # segnale 1
        own_masculine = any(self.families.get((word,c,'Pos'),{}).get(word,{}).get('gender')=={'Masc'} for c in own_categories)
        for lemma,_,plural,feminine in inflected:
            gap = word_zipf-float(frequency(lemma))
            if plural:
                if own_masculine and feminine:
                    continue                                                 # segnale 2: nome maschile e femminile plurale (cane, sole)
                tantum = float(frequency(lemma))<=self.COMMON_PLURAL_SINGULAR_MAX and self.is_regular_plural(word,lemma)
                if gap>=HOMOGRAPH_MARGIN and not tantum:
                    continue                                                 # segnale 3
                return False
            if gap<FEMININE_HOMOGRAPH_MARGIN:
                return False                                                 # un vero femminile: nessun segnale
        return True                                                          # tutte le letture flesse sono coperte da un segnale

    def audit(self, out, sample_size=40):
        """Controlli sul risultato (non lo modificano): plurali e femminili rimasti con il lemma presente, per motivo; omografi tenuti;
        plurali più comuni; campioni delle parole tolte per regola; controlli di riferimento. `ok` è falso se un controllo di riferimento
        fallisce o se i residui sospetti (esclusi gli omografi) superano RESIDUE_LIMIT."""
        kept = self.known-set(out)
        def sample(words):
            words = sorted(words)
            return words if len(words)<=sample_size else [words[i*len(words)//sample_size] for i in range(sample_size)]
        residue, seen = defaultdict(list), set()
        for key,forms in self.families.items():
            lemma,category = key[0],key[1]
            if category not in {'NOUN','ADJ'} or (len(key)>2 and key[2]!='Pos'):
                continue
            for word,d in forms.items():
                if word==lemma or word in seen or word not in kept or lemma not in kept:
                    continue
                if 'Plur' in d['number'] or d['gender']=={'Fem'}:
                    seen.add(word)
                    readings = self.readings.get(word,set())
                    reason = ('omografo' if word in getattr(self,'homographs',()) else
                              'altra_categoria' if any(isinstance(v,str) and v not in {'VERB','AUX'} for v in readings) else
                              'lemma_in_conflitto')
                    residue[reason].append(f'{word}<{lemma}')
        by_rule = defaultdict(list)
        for word,evidence in out.evidence.items():
            by_rule[evidence.get('rule','?')].append(word)
        checks = {w:{'expected':want,'actual':'kept' if w in kept else 'excluded'}
                  for w,want in self.REFERENCE_CHECKS.items() if w in self.known}
        failures = sorted(w for w,c in checks.items() if c['expected']!=c['actual'])
        total = sum(len(v) for v in residue.values())
        suspect = total-len(residue.get('omografo',()))   # gli omografi sono tenuti di proposito: non sono residui sospetti
        return {'residual_inflected_forms':{'total':total,'suspect':suspect,'by_reason':{k:len(v) for k,v in sorted(residue.items())},
                                            'limit':self.RESIDUE_LIMIT,'sample':{k:sample(v) for k,v in sorted(residue.items())}},
                'homographs_kept':{'total':len(getattr(self,'homographs',())),'words':sorted(getattr(self,'homographs',())),'sample':sample(getattr(self,'homographs',()))},
                'common_plurals':{'total':len(by_rule.get('common_plural',())),'sample':sample(by_rule.get('common_plural',()))},
                'removed_by_rule':{r:{'total':len(w),'sample':sample(w)} for r,w in sorted(by_rule.items())},
                'reference_checks':{'checked':len(checks),'failed':failures,'details':{w:checks[w] for w in failures}},
                'ok':not failures and suspect<=self.RESIDUE_LIMIT}

    RESIDUE_LIMIT = 500  # plurali e femminili con lemma presente ancora in normalizzata: oltre, il controllo segnala un problema

    def finish(self,frequency=None):
        if frequency is None:
            from wordfreq import zipf_frequency
            frequency = lambda w:zipf_frequency(w,'it')
        def canonical(lemma,category,seen=frozenset()):
            if lemma in seen:
                return lemma
            # Un femminile molto più comune del suo presunto maschile (strada/stradino, persona/delatore, carne/antropofago) è una parola
            # a sé: le fonti li legano per una forma rara, e non diventa un alias del maschile.
            genders = {t for t in self.gender_aliases.get((lemma,category),())
                       if float(frequency(lemma))<float(frequency(t))+FEMININE_HOMOGRAPH_MARGIN}
            targets = genders or self.number_aliases.get((lemma,category),())
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
        ambiguous, lemma_conflicts, self.homographs = set(), set(), set()
        for word,readings in self.readings.items():
            adjective_lemmas = {v[0] for v in readings if isinstance(v,tuple) and v[1]=='ADJ'}
            participial = any(form in adjective_lemmas for verb in self.verb_lemmas.get(word,()) for form in regular_participles(verb))
            # Una lettura verbale non rende ambigua una forma di nome o aggettivo: la forma verbale ha il suo infinito (sposa: nome
            # femminile di sposo e voce di sposare). Contano le altre categorie (avverbio, pronome...) e i lemmi in conflitto.
            # Un verbo all'infinito non è mai la forma flessa di un nome o aggettivo (tenere non è il plurale di tenero, leggere di leggero).
            if self.verb_marks.get(word,0)&2 and any(isinstance(v,tuple) and v[0]!=word for v in readings):
                ambiguous.add(word); lemma_conflicts.add(word); self.homographs.add(word)
            elif self.is_homograph(word,readings,frequency):
                ambiguous.add(word); lemma_conflicts.add(word); self.homographs.add(word)
            if any(isinstance(v,str) and v not in {'VERB','AUX'} for v in readings) and not participial:
                ambiguous.add(word)
            lemmas = {(canonical(v[0],v[1]),v[1]) for v in readings if isinstance(v,tuple)}
            if len({v[0] for v in lemmas if v[0]!=canonical(word,v[1])})>1:
                ambiguous.add(word)
                lemma_conflicts.add(word)
        out = select_families(merged,ambiguous,frequency,lemma_conflicts)
        out = self.exclude_verb_forms(out)
        out = self.exclude_reflexive_verbs(out)
        out = self.exclude_plurals_of_excluded_forms(out)
        out = self.prefer_most_common_lemma(out,frequency)
        out = self.exclude_orthographic_plurals(out,frequency)
        out = self.exclude_forms_of_present_lemmas(out,frequency)
        out = self.exclude_regular_superlatives(out)
        out = self.exclude_orthographic_superlatives(out)
        out = self.prefer_common_plurals(out,frequency)
        # Nessuna sostituta può essere a sua volta esclusa: nel dubbio la parola resta.
        for word,target in list(out.items()):
            if target and target[0] in out:
                del out[word]; out.reasons.pop(word,None); out.evidence.pop(word,None)
        return out

    def prefer_most_common_lemma(self, out, frequency):
        """Fra due lemmi legati da una variante si tiene il più comune, ma mai un femminile al posto di un maschile (18/11/2026). Le fonti possono
        dare uno dei due come forma dell'altro senza numero, e la prima regola non lo riconosce come variante di genere:
        qui, se un membro di un gruppo è lemma di una famiglia sua e supera di GENDER_MARGIN lo Zipf del rappresentante,
        diventa lui il rappresentante e tutto il gruppo lo segue."""
        # Solo lemmi singolari: cuffie (lemma plurale) non soppianta cuffia, né peperoni peperone.
        lemmas = {key[0] for key,forms in self.families.items() if key[1] in {'NOUN','ADJ'} and (len(key)<3 or key[2]=='Pos')
                  and key[0] in forms and 'Sing' in forms[key[0]]['number']}
        feminine = {key[0] for key,forms in self.families.items() if key[0] in forms and forms[key[0]]['gender']=={'Fem'}}
        groups = defaultdict(list)
        for word,target in out.items():
            if target:
                groups[target[0]].append(word)
        for rep,members in sorted(groups.items()):
            if rep in out or rep not in self.known:
                continue
            candidates = [m for m in members if m in lemmas and not self.verb_marks.get(m,0)&1]
            if rep not in feminine:
                candidates = [m for m in candidates if m not in feminine]  # il maschile non cede mai a un femminile più comune
            if not candidates:
                continue
            best = max(sorted(candidates),key=lambda w:float(frequency(w)))
            if float(frequency(best))<float(frequency(rep))+GENDER_MARGIN:
                continue
            for member in members+[rep]:
                if member==best:
                    continue
                before = out.evidence.get(member) or {}
                out[member] = [best]
                out.reasons[member] = (f'Variante del lemma più comune: si tiene {best} (Zipf {float(frequency(best)):.2f}, '
                                       f'forma esclusa {float(frequency(member)):.2f})')
                out.evidence[member] = {**before,'canonical':best,'zipf_form':float(frequency(member)),'zipf_canonical':float(frequency(best)),
                                        'rule':'more_common_lemma' if member==rep else before.get('rule','inflected_form')}
            out.pop(best,None); out.reasons.pop(best,None); out.evidence.pop(best,None)
        return out

    def exclude_plurals_of_excluded_forms(self, out):
        """Il plurale di una forma già esclusa segue il suo singolare: massaia lascia il posto a massaio, quindi anche
        massaie (plurale di massaia) lo lascia. Succede quando le fonti non sono d'accordo sul lemma del plurale e la parola,
        giudicata ambigua, era rimasta. Serve un solo rappresentante, a sua volta non escluso."""
        for (plural,category),singulars in sorted(self.number_aliases.items()):
            if plural in out or plural not in self.known or self.verb_marks.get(plural,0)&1 or plural in self.homographs:
                continue
            resolved = {out[t][0] if t in out and out[t] else t for t in singulars if t in out}
            if len(resolved)!=1:
                continue
            target = next(iter(resolved))
            if target!=plural and target in self.known and target not in out:
                out[plural] = [target]
                out.reasons[plural] = f'Plurale di una forma esclusa; si tiene {target}'
                out.evidence[plural] = {'rule':'inflected_form','via':sorted(singulars),'pos':category}
        return out

    # Plurali di parole che nessuna fonte morfologica conosce (solo liste di parole come napolux): il singolare si ricava
    # dall'ortografia. Solo desinenze regolari e non ambigue; -e/-a è escluso (sale/sala, case/caso non sono plurali).
    PLURAL_ENDINGS = (('isti','ista'),('ioni','ione'),('chi','co'),('ghi','go'),('ci','co'),('gi','go'),('che','ca'),('ghe','ga'),('i','o'))

    def exclude_orthographic_plurals(self, out, frequency):
        """Toglie il plurale di una parola senza attestazioni morfologiche quando il singolare regolare è nella raccolta,
        non è escluso e non è molto meno frequente (tesi/teso, parti/parto restano). Una sola passata: la sostituta non
        può essere a sua volta esclusa."""
        attested = set(self.readings)|set(self.verb_marks)|{w for forms in self.families.values() for w in forms}
        representatives = {v[0] for v in out.values() if v}
        for word in sorted(self.known):
            if len(word)<6 or word in out or word in attested or word in representatives:
                continue
            for ending,singular_ending in self.PLURAL_ENDINGS:
                if not word.endswith(ending):
                    continue
                singular = word[:-len(ending)]+singular_ending
                if singular in self.known and singular!=word and singular not in out and frequency(singular)>=frequency(word)-0.3:
                    out[word] = [singular]
                    out.reasons[word] = f'Plurale regolare senza attestazioni morfologiche; si tiene {singular}'
                    out.evidence[word] = {'rule':'orthographic_plural','singular':singular,'ending':ending}
                    break
                break  # la desinenza più specifica decide: se il suo singolare manca, la parola resta
        # Nessuna sostituta può essere esclusa a sua volta (le due passate non ne creano, ma il controllo costa poco).
        for word,target in list(out.items()):
            if target and target[0] in out:
                del out[word]; out.reasons.pop(word,None); out.evidence.pop(word,None)
        return out

    def exclude_forms_of_present_lemmas(self, out, frequency):
        """Una forma che nessuna fonte dà come lemma a sé (plurale, femminile, altra flessione) esce se uno dei suoi lemmi è nella
        raccolta e resta, anche quando le fonti non concordano sul lemma (funeste: funesto o funesta) o la forma ha pure una lettura
        verbale (raccolti, intese). Restano le forme con una lettura che non è nome, aggettivo o verbo (tutti) e quelle che sono
        il lemma di una loro lettura (bella)."""
        inflected = {w for forms in self.families.values() for w,d in forms.items() if d['gender'] or d['number']}
        by_target = defaultdict(list)
        for form,target in out.items():
            if target:
                by_target[target[0]].append(form)
        # Comparativi e superlativi sono famiglie distinte, rappresentate dal maschile singolare del loro grado (migliore, bellissimo).
        graded, graded_winners = defaultdict(set), set()
        positive = {w for key,forms in self.families.items() if len(key)<3 or key[2]=='Pos'
                    for w,d in forms.items() if d['gender'] or d['number']}
        for key,forms in self.families.items():
            if len(key)>2 and key[2]!='Pos':
                winner = next((w for w,d in sorted(forms.items()) if d['gender']=={'Masc'} and d['number']=={'Sing'}),None)
                if winner:
                    graded_winners.add(winner)
                    for member,d in forms.items():
                        if (d['gender'] or d['number']) and member not in positive:
                            graded[member].add(winner)
        for word in sorted(self.readings):
            if word in out or word not in self.known or word not in inflected or word in graded_winners or word in self.homographs:
                continue
            readings = self.readings[word]
            tuples = [v for v in readings if isinstance(v,tuple)]
            if not tuples or any(isinstance(v,str) and v not in {'VERB','AUX','PRON','DET'} for v in readings):
                continue
            lemmas = {v[0] for v in tuples}
            if word in lemmas:
                # Una forma che è anche lemma a sé (sarda, poltrone) esce lo stesso se in un'altra lettura è il femminile o il plurale
                # di un lemma presente: nel RAW c'è un solo lemma, il maschile singolare (o il femminile se il maschile non esiste).
                lemmas = {v[0] for v in tuples if v[0]!=word and (d:=self.families.get((v[0],v[1],'Pos'),{}).get(word))
                          and ('Plur' in d['number'] or d['gender']=={'Fem'})}
                if not lemmas and word not in graded:
                    continue
            candidates = set()
            if word in graded:
                candidates = {w for w in graded[word] if w in self.known and w not in out and w != word}
            else:
                for lemma in lemmas:
                    final = (out[lemma][0] if out[lemma] else None) if lemma in out else lemma
                    if final and final in self.known and final not in out and final != word:
                        candidates.add(final)
            if not candidates:
                continue
            replacement = max(sorted(candidates),key=lambda l:float(frequency(l)))
            for form in by_target.pop(word,()):
                out[form] = [replacement]
                by_target[replacement].append(form)
            out[word] = [replacement]
            by_target[replacement].append(word)
            out.reasons[word] = f'Forma flessa: si tiene il lemma {replacement}'
            out.evidence[word] = {'rule':'inflected_form','canonical':replacement,'lemmas':sorted(lemmas),'pos':'NOUN/ADJ'}
        return out

    # Plurali regolari: (desinenza del plurale, desinenza del singolare). Ammessi anche -e → -a e -i → -e, -i → -io per questa regola.
    REGULAR_PLURALS = (('isti','ista'),('ioni','ione'),('chi','co'),('ghi','go'),('ci','co'),('gi','go'),('che','ca'),('ghe','ga'),
                       ('ce','cia'),('ge','gia'),('i','o'),('i','e'),('i','io'),('e','a'))
    COMMON_PLURAL_SINGULAR_MAX = 3.0  # il singolare deve essere raro: menta (3,67) non cede a mente

    def is_regular_plural(self, plural, lemma):
        return any(plural.endswith(pe) and plural[:len(plural)-len(pe)]+se==lemma for pe,se in self.REGULAR_PLURALS)

    @staticmethod
    def regular_superlatives(lemma):
        """Il superlativo assoluto regolare di un aggettivo: onesto → onestissimo, felice → felicissimo, ricco → ricchissimo, saggio → saggissimo."""
        forms = {lemma[:-1]+'issimo'}
        if lemma.endswith(('co','go')):
            forms.add(lemma[:-1]+'hissimo')
        if lemma.endswith('io'):
            forms.add(lemma[:-2]+'issimo')
        return forms

    SUPERLATIVE_ENDINGS = ('issimo','issima','issimi','issime')

    @staticmethod
    def superlative_bases(word):
        """Gli aggettivi da cui una forma in -issimo/-issima/-issimi/-issime può derivare: saggissimo → saggio, ricchissimo → ricco,
        felicissima → felice, aiutissimo → aiuto, alticchissima → alticcio; benissimo → bene (avverbio). Vuoto se non finisce così."""
        for ending in FamilyEvidence.SUPERLATIVE_ENDINGS:
            if word.endswith(ending) and len(word)>len(ending)+2:
                stem = word[:-len(ending)]
                bases = {stem+v for v in ('o','a','e','io')}
                if stem.endswith(('ch','gh')):
                    bases |= {stem[:-1]+v for v in ('o','a','io')}
                return bases
        return set()

    def exclude_orthographic_superlatives(self, out):
        """Ogni superlativo assoluto regolare esce, anche quando le fonti non lo collegano all'aggettivo (aiutissimo, saggissimo,
        alticchissimo, benissimo): se l'aggettivo da cui deriva è nella raccolta e resta, la forma in -issimo, -issima, -issimi o
        -issime ha l'aggettivo come sostituto. I superlativi irregolari (ottimo, massimo, pessimo) non finiscono così e restano."""
        by_target = defaultdict(list)
        for form,target in out.items():
            if target:
                by_target[target[0]].append(form)
        for word in sorted(self.known):
            if word in out or len(word)<8:
                continue
            bases = sorted(b for b in self.superlative_bases(word) if b in self.known and b not in out and b!=word)
            if not bases:
                continue
            base = bases[0]
            for form in by_target.pop(word,()):
                out[form] = [base]
                by_target[base].append(form)
            out[word] = [base]
            by_target[base].append(word)
            out.reasons[word] = f"Superlativo assoluto regolare: si tiene la base {base}"
            out.evidence[word] = {'rule':'regular_superlative','canonical':base,'pos':'ADJ'}
        return out

    def exclude_regular_superlatives(self, out):
        """In normalizzata c'è solo l'aggettivo: il superlativo assoluto regolare (onestissimo) è una sua forma flessa e esce, con le sue
        flessioni. I superlativi irregolari (ottimo, massimo, minimo) e i comparativi (migliore) sono parole a sé e restano."""
        by_target = defaultdict(list)
        for form,target in out.items():
            if target:
                by_target[target[0]].append(form)
        for key,forms in sorted(self.families.items()):
            if len(key)<3 or key[2]!='Sup' or key[1]!='ADJ':
                continue
            lemma = key[0]
            if lemma not in self.known or lemma in out:
                continue
            winner = next((w for w,d in sorted(forms.items()) if d['gender']=={'Masc'} and d['number']=={'Sing'}),None)
            if not winner or winner in out or winner not in self.known or winner not in self.regular_superlatives(lemma):
                continue
            for form in by_target.pop(winner,()):
                out[form] = [lemma]
                by_target[lemma].append(form)
            out[winner] = [lemma]
            by_target[lemma].append(winner)
            out.reasons[winner] = f"Superlativo assoluto regolare: si tiene l'aggettivo {lemma}"
            out.evidence[winner] = {'rule':'regular_superlative','canonical':lemma,'pos':'ADJ'}
        return out

    def prefer_common_plurals(self, out, frequency):
        """Un nome o aggettivo è al singolare, a meno che il suo plurale sia nettamente più comune (almeno PLURAL_MARGIN di Zipf, con
        il singolare raro) e abbia una voce propria nelle fonti, della stessa categoria: stoviglie resta e stoviglia esce, con tutte
        le altre forme del lemma. Il plurale deve essere il plurale regolare del lemma (non parte per parto, né mente per menta se
        menta è comune): altrimenti la frequenza premierebbe gli omografi."""
        plurals = defaultdict(set)
        for key,forms in self.families.items():
            if key[1] in {'NOUN','ADJ'} and (len(key)<3 or key[2]=='Pos'):
                plurals[key[0]].update((w,key[1]) for w,d in forms.items() if w!=key[0] and d['number']=={'Plur'})
        by_target = defaultdict(list)
        for form,target in out.items():
            if target:
                by_target[target[0]].append(form)
        for lemma in sorted(plurals):
            if lemma in out or lemma not in self.known or float(frequency(lemma))>self.COMMON_PLURAL_SINGULAR_MAX:
                continue
            candidates = []
            for plural,category in plurals[lemma]:
                if plural not in out or out[plural]!=[lemma] or not self.is_regular_plural(plural,lemma):
                    continue
                readings = self.readings.get(plural,set())
                own = {v[0] for v in readings if isinstance(v,tuple)}
                # Il plurale ha una voce propria nelle fonti (stoviglie, forbici, nozze), nella categoria del lemma, oltre a essere
                # forma del singolare: senza questa prova la sola frequenza premia gli omografi (nei, agli, fai, stai).
                if (plural,category) not in readings or own-{plural}!={lemma} or any(isinstance(v,str) and v not in {'VERB','AUX'} for v in readings):
                    continue
                candidates.append(plural)
            if not candidates:
                continue
            best = max(sorted(candidates),key=lambda w:float(frequency(w)))
            if float(frequency(best))<float(frequency(lemma))+PLURAL_MARGIN:
                continue
            for form in by_target.pop(lemma,()):
                if form!=best:
                    out[form] = [best]
                    by_target[best].append(form)
            out.pop(best,None); out.reasons.pop(best,None); out.evidence.pop(best,None)
            out[lemma] = [best]
            out.reasons[lemma] = (f'Il plurale è la forma più comune: si tiene {best} (Zipf {float(frequency(best)):.2f}, '
                                  f'singolare {float(frequency(lemma)):.2f})')
            out.evidence[lemma] = {'rule':'common_plural','canonical':best,'zipf_form':float(frequency(lemma)),'zipf_canonical':float(frequency(best)),'pos':'NOUN/ADJ'}
        return out

    def exclude_reflexive_verbs(self, out):
        """Un infinito riflessivo (-rsi: lavarsi, offrirsi) è il verbo semplice con il pronome: se l'infinito semplice è nella
        raccolta e resta, la forma in -rsi esce e lo ha come sostituto. Restano i verbi essenzialmente pronominali, che non hanno
        una base (accorgersi, pentirsi, arrabbiarsi)."""
        by_target = defaultdict(list)
        for form, target in out.items():
            if target:
                by_target[target[0]].append(form)
        for word in sorted(w for w in self.known if len(w) >= 6 and w.endswith('rsi')):
            if word in out:
                continue
            marks = self.verb_marks.get(word, 0)
            if marks & 4 or (marks & 1 and not marks & 2):
                continue  # persi, versi, corsi: plurali, nomi o participi, non infiniti riflessivi
            stem = word[:-2]  # offrir; per -ursi/-orsi anche tradur+re
            base = next((b for b in (stem+'e', stem+'re') if b in self.known and b not in out and b != word), None)
            if base is None:
                continue
            # Le forme che avevano la forma in -rsi come sostituta (mescolandosi → mescolarsi) passano all'infinito semplice.
            for form in by_target.pop(word, ()):
                out[form] = [base]
                by_target[base].append(form)
            out[word] = [base]
            by_target[base].append(word)
            out.reasons[word] = f"Infinito riflessivo: si tiene l'infinito semplice {base}"
            out.evidence[word] = {'rule':'reflexive_infinitive','infinitive':base,'pos':'VERB'}
        return out

    def exclude_verb_forms(self, out):
        """Toglie le parole attestate solo come forme verbali diverse dall'infinito (coniugate, participi, gerundi).
        Una forma attestata anche come nome, aggettivo, avverbio o altro, o come infinito, resta."""
        # Un rappresentante scelto per nomi e aggettivi resta anche se altrove è attestato solo come forma verbale:
        # escluderlo lascerebbe le sue forme flesse senza sostituta.
        representatives = {v[0] for v in out.values() if v}
        verbs = sorted(w for w,m in self.verb_marks.items() if m==1 and w not in out and w not in representatives)
        gone = set(verbs)
        for word in verbs:
            lemmas = sorted(self.verb_lemmas[word])
            replacement = [l for l in lemmas if l in self.known and l not in gone and l not in out and l!=word]
            out[word] = replacement[:1]
            out.reasons[word] = "Forma verbale diversa dall'infinito" +(f'; infinito: {replacement[0]}' if replacement else '')
            out.evidence[word] = {'rule':'verb_form','lemmas':lemmas,'pos':'VERB'}
        # Nessuna sostituta può essere a sua volta esclusa (normalizzazione_esclusioni.sostituita_da -> normalizzata):
        # nel dubbio la parola resta.
        changed = True
        while changed:
            changed = False
            for word, target in list(out.items()):
                if target and target[0] in out:
                    del out[word]
                    out.reasons.pop(word, None)
                    out.evidence.pop(word, None)
                    changed = True
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
