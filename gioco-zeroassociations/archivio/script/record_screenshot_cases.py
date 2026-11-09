"""Ricostruisce i casi mostrati in conversazione dai metadati originali.

Annotazioni editoriali diagnostiche, non blacklist e non QA indipendente.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
CASES = [
 ('terna', ['benna'], [
  ('unfamiliar_sense', ['escavatore'], 'Legame reale con la macchina da cantiere; il prompt isolato non disambigua questo senso specialistico.'),
  ('generic_description', ['lavoro','macchina','fronte','retro'], 'Descrittori generici o posizionali della macchina, non sette associazioni naturali al contesto visibile.')]),
 ('rugby', ['squadra','sport'], [
  ('incidental_history', ['secolo','metà'], 'Sono estratti da «a metà del diciannovesimo secolo». Non descrivono il gioco. Meta e metà restano parole distinte.'),
  ('support_verb', ['cercare','entrare'], 'Servono alla frase sulle azioni dei giocatori, senza esprimere da soli una specificità del rugby.')]),
 ('aria', ['gas','ossigeno','azoto','atmosfera'], [
  ('quantitative_scaffolding', ['misura'], 'Proviene da «in misura di 78 parti»: è parte della formulazione quantitativa.'),
  ('support_verb', ['comporre'], 'Descrive la composizione dei gas nella frase; non va salvato passando al senso musicale di aria.')]),
 ('morte', [], [
  ('support_description', ['permettere','successivo','sostituire','generazione'], 'Frammenti della frase sulla successione delle generazioni, non risposte direttamente recuperabili.'),
  ('mere_applicability', ['animale','pianta'], 'Sono esempi di organismi che possono morire: la mera applicabilità non basta a scegliere le risposte.')]),
 ('light', ['leggero'], [
  ('lost_qualifier', ['alcol','nocivo'], 'Dagli esempi di prodotti a basso contenuto di certe sostanze è stato perso il qualificatore «basso contenuto».'),
  ('generic_description', ['sostanza','prodotto','contenuto','alimentare'], 'Descrivono genericamente la classe di prodotti e non devono riempire il set.')]),
 ('cosplay', ['costume','personaggio'], [
  ('support_verb', ['pensare','agire'], 'Estratti da «imitarne il modo di agire e pensare»: non sono autonomamente caratteristici del cosplay.'),
  ('broken_expression', ['massa','cultura','pratica'], '«Cultura di massa» è stata scomposta; «pratica di» è una formula descrittiva generale.')]),
 ('palato', ['bocca','osso'], [
  ('cross_sense_relation', ['palo','fasciato','sbarrato'], 'Relazioni del senso araldico importate nel senso anatomico.'),
  ('figurative_relation', ['competenza','gusto'], 'Relazioni figurate attribuite automaticamente alla definizione anatomica; gusto richiede valutazione distinta, non un divieto universale.')]),
 ('gufo', ['occhio'], [
  ('generic_description', ['famiglia','corpo','colore'], 'La frequenza dei descrittori ha prevalso su caratteristiche dell’animale come rapace e notturno.'),
  ('incidental_belief', ['popolare','tradizione'], 'Provengono dall’inciso sulle credenze di malaugurio.'),
  ('broken_expression', ['disco'], 'È stato isolato da «disco facciale», perdendo il significato anatomico.')]),
 ('spandere', ['distendere','fluido'], [
  ('manner_description', ['coerenza'], 'Descrive genericamente come si distribuisce la sostanza, nella locuzione «con regolarità e coerenza».'),
  ('generic_description', ['ampiezza','piano'], 'Dettagli ampi della superficie di distribuzione: richiedono valutazione di specificità, non l’accettazione per presenza nella definizione.')]),
 ('sottomarino', ['acqua','navale','subacqueo'], [
  ('support_verb', ['operare','costruire'], 'Da «costruita per operare sott’acqua»: operare perde specificità senza il complemento, costruire vale per moltissimi manufatti.')]),
 ('esperto', ['conoscenza','esperienza'], [
  ('figurative_antonym', ['digiuno'], 'Contrario legato a «essere digiuno di una materia»; la parola isolata evoca prevalentemente l’alimentazione.'),
  ('support_description', ['specifico','delineare'], 'Descrivono il settore delle conoscenze nella frase, non il carattere di una risposta autonoma.')]),
 ('pongo', ['cera','bambino','modellazione'], [
  ('cross_sense_taxonomy', ['orango','animale'], 'Iponimo e iperonimo di un altro senso importati nel set del materiale da modellare.')]),
 ('coagulazione', ['sangue'], [
  ('technical_but_ambiguous', ['gel'], 'Il rapporto con «gel di fibrina» è tecnicamente reale; la parola isolata è ambigua e poco immediata. Non va dichiarata fattualmente falsa.'),
  ('generic_process_description', ['formazione','impedire'], 'Nome generico del processo e verbo introduttivo dello scopo.'),
  ('lemma_meaning_change', ['ferito'], 'La forma ferita indicava una lesione; la lemmatizzazione l’ha resa aggettivo/persona ferita, cambiando il senso.')]),
 ('improvviso', [], [
  ('synonym_accumulation', ['inaspettato','imprevisto','inatteso'], 'Tre risposte quasi equivalenti occupano lo spazio di associazioni diverse.'),
  ('derivative_accumulation', ['improvvisare','improvvisato'], 'Derivati della stessa famiglia, collegati anche al diverso senso di eseguire senza preparazione.'),
  ('support_verb', ['verificare'], 'Proviene da «si verifica»: è il verbo della definizione e non una risposta naturale.')]),
 ('travestimento', [], [
  ('support_description', ['operazione','compiere','speciale','fine'], 'Frammenti della frase su operazioni segrete o fini ludici, selezionati al posto di elementi del travestirsi.'),
  ('underspecified_context', ['copertura','segreto','aspetto'], 'Relazioni descrittive o riferite al solo uso clandestino: occorre scegliere e mantenere un contesto familiare coerente.')]),
 ('skateboard', ['ruota','piede'], [
  ('negated_source_feature', ['manubrio'], 'La definizione dice «senza manubrio»: il vecchio generatore ha perso la negazione e selezionato una componente assente.'),
  ('support_description', ['grado','provvisto','orientare','pressione'], 'Frammenti di «in grado di essere orientato con la pressione dei piedi»; non sostituiscono oggetti o azioni caratteristiche dello skateboard.')]),
 ('difendere', ['salvaguardare'], [
  ('underspecified_context', ['individuo','posizione','idea'], 'Oggetti grammaticalmente plausibili del verbo, non tutti falsi: prima precisare il contesto di protezione, militare o argomentativo.'),
  ('weak_relation', ['conservare','aiutare'], 'Relazioni ampie che non sono sinonimi intercambiabili in ogni senso di difendere.'),
  ('weak_antonym', ['abbandonare'], 'Il contrario di dizionario non basta: valutare se il contrasto è naturale nel contesto scelto.')]),
 ('masso', ['macigno','roccia','sasso'], [
  ('weak_antonym', ['granello'], 'Contrasto di dimensioni non sufficientemente naturale come risposta al masso isolato.'),
  ('ambiguous_related_word', ['massone','massetto'], 'Somiglianza o correlazione di lemma non dimostra un’associazione comune: i termini hanno significati dominanti diversi dal grande sasso.')]),
 ('tribuna', [], [
  ('unfamiliar_sense', ['altare','clero','sacro','architettura'], 'La fonte descrive una tribuna nell’architettura sacra. Il rapporto è reale in quel senso, ma non quello normalmente evocato dalla parola isolata.'),
  ('support_verb', ['porre'], 'Deriva da «posta dietro l’altare»: è il verbo descrittivo della collocazione.')]),
 ('tigre', ['pelliccia','striscia','arancione','nero','bianco'], [
  ('dictionary_metadescription', ['scientifico','classificazione'], 'Descrivono la classificazione scientifica della voce, non caratteristiche distintive dell’animale.'),
  ('attribute_concentration', ['arancione','nero','bianco'], 'Colori corretti, da conservare selettivamente: tre colori possono concentrare troppo il set sullo stesso aspetto.')]),
 ('impoverire', ['povero','arricchire'], [
  ('mixed_sense', ['attenuazione','capacità','ragionamento','dissanguare','rovinare'], 'La definizione scelta riguarda il ragionamento; le relazioni aggiunte richiamano anche l’impoverimento economico o usi figurati. Unificare il senso.'),
  ('figurative_relation', ['dissanguare'], 'Il legame economico è figurato: la parola isolata ha anche un significato letterale molto diverso. Non importarla automaticamente come sinonimo.')]),
 ('agonistico', ['sportivo','competizione'], [
  ('definitional_connector', ['inerente'], 'Proviene da «inerente a competizioni sportive»: introduce il rapporto della definizione, senza identificare il contenuto sportivo da solo.'),
  ('same_semantic_nucleus', ['competizione','competitivo'], 'Nome e aggettivo ripetono lo stesso nucleo. Cambiare POS non basta a rendere distinto il contenuto delle risposte.'),
  ('unverified_antonym_axis', ['amatoriale'], 'Il dizionario lo presenta come contrario, ma attività amatoriali possono prevedere competizioni. Verificare l’asse concettuale anziché opporre automaticamente le etichette.'),
  ('unfamiliar_related_word', ['agone'], 'Termine correlato che richiede verifica di familiarità e utilità: la parentela non giustifica una risposta poco immediata.')]),
]


def main():
    folder = ROOT/'generated-v3_6_0'
    original = {}
    for path in (folder/'archivio_prima_revisione_semantica_0003.jsonl',
                 folder/'archivio_prima_revisione_semantica_0002.jsonl',
                 folder/'word_association_it_5000_metadati_0003.jsonl',
                 folder/'word_association_it_5000_metadati_0002.jsonl'):
        if not path.exists():continue
        with path.open(encoding='utf-8') as stream:
            for line in stream:
                row = json.loads(line)
                original.setdefault(row['prompt'], (path.name, row))
    records = []
    for number, (prompt, legitimate, issues) in enumerate(CASES, 1):
        file, row = original[prompt]
        records.append({'case_id': f'SCREENSHOT-{number:02d}', 'prompt': prompt,
            'sense_id': row.get('sense_id'), 'source_file': file,
            'candidate_id': row['candidate_id'], 'source_gloss': row['source_gloss'],
            'original_words': row['words'], 'potentially_valid_words': legitimate,
            'issues': [{'code': code, 'words': words, 'reason': reason} for code, words, reason in issues],
            'action': 'Cercare alternative mantenendo il prompt; conservare le risposte valide e verificare il set.',
            'semantic_approval': False})
    target = ROOT/'resources/semantic_regressions_it.jsonl'
    target.write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in records), encoding='utf-8')
    text = ['# Analisi degli screenshot Word Association — 8 novembre 2026', '',
        f'Ricostruiti i {len(records)} contesti problematici mostrati o citati nella conversazione. '
        'I due screenshot senza prompt sono DIFENDERE e MASSO. RUGBY era citato anche nel testo. '
        'Il riferimento iniziale CARAMELLA documentava il formato del CSV.', '',
        'Le parole e le definizioni sono confrontate con i metadati originari: per i set già '
        'corretti è usato l’archivio precedente alla revisione. SPANDERE è nel lotto 0002. '
        'Questa analisi non equivale a una prova con giocatori né a un’approvazione indipendente.', '',
        '| Contesto | Diagnosi | Parole con un legame da conservare o valutare |',
        '|---|---|---|']
    for row in records:
        diagnoses = '<br>'.join('**'+', '.join(i['words'])+'**: '+i['reason'] for i in row['issues'])
        text.append('| '+row['prompt'].upper()+' | '+diagnoses+' | '+(', '.join(row['potentially_valid_words']) or 'Rielaborare il set nel senso scelto')+' |')
    text += ['', '## Provenienza e vincoli', '',
        'Il catalogo [semantic_regressions_it.jsonl](resources/semantic_regressions_it.jsonl) '
        'conserva per ogni caso ID, accezione, file sorgente, candidato, definizione originale, '
        'sette risposte e motivazioni. Le segnalazioni sono contestuali: non costituiscono '
        'una blacklist dei prompt o delle parole.', '',
        'TERNA, TRIBUNA e il gel di fibrina richiedono la distinzione tra verità tecnica e '
        'accessibilità. In DIFENDERE alcuni legami sono plausibili ma troppo ampi; in TIGRE '
        'i colori sono corretti. Non vanno dichiarate false tutte le risposte dello screenshot.', '',
        'Le regole operative aggiornate sono nei §§3.10–3.14 delle '
        '[direttive](direttive_word_association_it_v3_6_0.md). Per ogni risposta debole '
        'cercare un’alternativa sullo stesso prompt e ripetere le verifiche del set.']
    (ROOT/'analisi_screenshot_word_association_20261108.md').write_text('\n'.join(text)+'\n', encoding='utf-8')
    print(f'{len(records)} casi ricostruiti; catalogo e analisi aggiornati.')


if __name__ == '__main__':
    main()
