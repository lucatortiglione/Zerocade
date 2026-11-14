-- Inventario del primo step: nessuna associazione e nessuna approvazione implicita.
CREATE TABLE IF NOT EXISTS inventory_sources(
 source_key TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
 url TEXT NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_snapshots(
 id TEXT PRIMARY KEY, source_key TEXT NOT NULL REFERENCES inventory_sources(source_key),
 sha256 TEXT NOT NULL, acquired_at TEXT NOT NULL, cache_path TEXT NOT NULL,
 records INTEGER NOT NULL CHECK(records>=0),
 source_config_json TEXT NOT NULL CHECK(json_valid(source_config_json)),
 UNIQUE(source_key,sha256)
) STRICT;
-- Le voci sono milioni: la tabella è WITHOUT ROWID (la chiave è la voce, niente indice a parte per lei), e
-- review_status, che nell'inventario vale sempre COLLECTED, è una colonna generata che non occupa spazio. Si
-- inseriscono le altre colonne. prompt_inventory.migrate_terms converte i database del vecchio formato usando
-- le istruzioni fra i due segni qui sotto.
-- voci:tabella
CREATE TABLE IF NOT EXISTS inventory_terms(
 prompt TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1)),
 has_lemma_evidence INTEGER NOT NULL CHECK(has_lemma_evidence IN (0,1)),
 has_inflected_evidence INTEGER NOT NULL CHECK(has_inflected_evidence IN (0,1)),
 has_proper_name_evidence INTEGER NOT NULL CHECK(has_proper_name_evidence IN (0,1)),
 has_it_dictionary_evidence INTEGER NOT NULL CHECK(has_it_dictionary_evidence IN (0,1)),
 review_status TEXT GENERATED ALWAYS AS ('COLLECTED') VIRTUAL
) STRICT, WITHOUT ROWID;
-- voci:fine
-- Le attestazioni sono milioni di righe con pochi valori ripetuti: lo snapshot (poche decine di id di 64
-- caratteri), il ruolo (una manciata) e la categoria grammaticale della fonte (qualche migliaio) stanno in
-- tabelle di lookup e ogni riga ne porta il numero; la forma della fonte si salva solo quando è diversa dalla
-- voce (NULL vuol dire uguale). Con la chiave fatta di numeri la tabella è WITHOUT ROWID: niente indice a parte
-- per la chiave. La vista inventory_attestations le mostra come prima, con i testi: si legge e si inserisce
-- sempre da lì. prompt_inventory.migrate_attestations converte i database del vecchio formato usando le
-- istruzioni fra i due segni qui sotto.
--
-- I dettagli JSON delle attestazioni (14/11/2026, da 1,5 GB) si salvano così:
-- - l'URL che è solo il prefisso della fonte più la forma (Wiktionary, Wikipedia, De Mauro) non si scrive: la
--   riga porta il numero del prefisso e nel documento l'URL resta vuoto, al suo posto; la vista lo ricostruisce;
-- - il documento è JSONB, il formato binario di SQLite; quelli brevi (fino a 128 byte, quasi sempre ripetuti:
--   morfologia, liste, frequenze) stanno una volta sola in inventory_attestation_details, gli altri nella riga;
-- - un documento che dalla vista non tornerebbe identico, carattere per carattere (spazi, sequenze \u…), resta
--   il testo originale nella riga: le impronte delle fonti (inventory_updates) si calcolano su questo testo.
-- Chi legge e chi scrive non cambia: inventory_attestations mostra e accetta details_json come prima;
-- inventory_attestation_rows_json dà le righe con i numeri e details_json. prompt_inventory.
-- migrate_attestation_details converte le righe del formato precedente (details_json nella riga).
-- attestazioni:tabelle
CREATE TABLE IF NOT EXISTS inventory_snapshot_numbers(
 n INTEGER PRIMARY KEY, snapshot_id TEXT NOT NULL UNIQUE REFERENCES inventory_snapshots(id)
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_roles(n INTEGER PRIMARY KEY, role TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_pos(n INTEGER PRIMARY KEY, pos TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_details(
 n INTEGER PRIMARY KEY, doc BLOB NOT NULL UNIQUE CHECK(json_valid(doc,4))
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_url_prefixes(n INTEGER PRIMARY KEY, prefix TEXT NOT NULL UNIQUE) STRICT;
INSERT OR IGNORE INTO inventory_url_prefixes(n,prefix) VALUES (1,'https://it.wiktionary.org/wiki/'),
 (2,'https://it.wikipedia.org/wiki/'),(3,'https://dizionario.internazionale.it/parola/');
CREATE TABLE IF NOT EXISTS inventory_attestation_rows(
 snapshot INTEGER NOT NULL REFERENCES inventory_snapshot_numbers(n),
 prompt TEXT NOT NULL REFERENCES inventory_terms(prompt),
 locator TEXT NOT NULL,
 role INTEGER NOT NULL REFERENCES inventory_attestation_roles(n),
 pos INTEGER NOT NULL REFERENCES inventory_attestation_pos(n),
 source_form TEXT, lemma TEXT NOT NULL,
 details INTEGER REFERENCES inventory_attestation_details(n),
 own_details ANY CHECK(own_details IS NULL OR json_valid(own_details,CASE typeof(own_details) WHEN 'blob' THEN 4 ELSE 1 END)),
 url_prefix INTEGER REFERENCES inventory_url_prefixes(n),
 CHECK((details IS NULL)<>(own_details IS NULL)),
 PRIMARY KEY(snapshot,prompt,locator,role)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS inventory_attestations_by_prompt ON inventory_attestation_rows(prompt);
-- attestazioni:vista
CREATE VIEW IF NOT EXISTS inventory_attestation_rows_json AS
 SELECT a.snapshot,a.prompt,a.locator,a.role,a.pos,a.source_form,a.lemma,
 CASE WHEN a.url_prefix IS NOT NULL
  THEN json_replace(coalesce(a.own_details,d.doc),'$.url',u.prefix||coalesce(a.source_form,a.prompt))
  WHEN typeof(a.own_details)='text' THEN a.own_details
  ELSE json(coalesce(a.own_details,d.doc)) END AS details_json
 FROM inventory_attestation_rows a
 LEFT JOIN inventory_attestation_details d ON d.n=a.details
 LEFT JOIN inventory_url_prefixes u ON u.n=a.url_prefix;
CREATE VIEW IF NOT EXISTS inventory_attestations AS
 SELECT a.prompt,s.snapshot_id,a.locator,r.role,p.pos,coalesce(a.source_form,a.prompt) AS source_form,a.lemma,a.details_json
 FROM inventory_attestation_rows_json a JOIN inventory_snapshot_numbers s ON s.n=a.snapshot
 JOIN inventory_attestation_roles r ON r.n=a.role JOIN inventory_attestation_pos p ON p.n=a.pos;
-- Il trigger fa per una riga quello che prompt_inventory.COMPACT_DETAILS fa per tutte: stesse regole.
CREATE TRIGGER IF NOT EXISTS inventory_attestations_insert INSTEAD OF INSERT ON inventory_attestations BEGIN
 SELECT RAISE(ABORT,'NOT NULL constraint failed: inventory_attestations.source_form') WHERE NEW.source_form IS NULL;
 SELECT RAISE(ABORT,'CHECK constraint failed: json_valid(details_json)') WHERE NOT json_valid(NEW.details_json);
 INSERT INTO inventory_snapshot_numbers(snapshot_id) SELECT NEW.snapshot_id
  WHERE NOT EXISTS(SELECT 1 FROM inventory_snapshot_numbers WHERE snapshot_id=NEW.snapshot_id);
 INSERT INTO inventory_attestation_roles(role) SELECT NEW.role
  WHERE NOT EXISTS(SELECT 1 FROM inventory_attestation_roles WHERE role=NEW.role);
 INSERT INTO inventory_attestation_pos(pos) SELECT NEW.pos
  WHERE NOT EXISTS(SELECT 1 FROM inventory_attestation_pos WHERE pos=NEW.pos);
 INSERT INTO inventory_attestation_details(doc)
  SELECT c.doc FROM (SELECT CASE WHEN x.exact THEN x.doc END AS doc FROM (
    SELECT y.doc,(CASE WHEN y.prefix IS NULL THEN json(y.doc) ELSE json_replace(y.doc,'$.url',y.pfx||NEW.source_form) END)
     IS NEW.details_json AS exact
    FROM (SELECT u.n AS prefix,u.prefix AS pfx,
      jsonb(CASE WHEN u.n IS NULL THEN NEW.details_json ELSE json_replace(NEW.details_json,'$.url','') END) AS doc
     FROM (SELECT 1) one LEFT JOIN inventory_url_prefixes u
      ON json_extract(NEW.details_json,'$.url')=u.prefix||NEW.source_form) y) x) c
  WHERE length(c.doc)<=128 AND NOT EXISTS(SELECT 1 FROM inventory_attestation_details WHERE doc=c.doc);
 INSERT INTO inventory_attestation_rows(snapshot,prompt,locator,role,pos,source_form,lemma,details,own_details,url_prefix)
  SELECT (SELECT n FROM inventory_snapshot_numbers WHERE snapshot_id=NEW.snapshot_id),NEW.prompt,NEW.locator,
  (SELECT n FROM inventory_attestation_roles WHERE role=NEW.role),
  (SELECT n FROM inventory_attestation_pos WHERE pos=NEW.pos),
  nullif(NEW.source_form,NEW.prompt),NEW.lemma,d.n,
  CASE WHEN d.n IS NULL THEN coalesce(c.doc,NEW.details_json) END,c.prefix
  FROM (SELECT CASE WHEN x.exact THEN x.prefix END AS prefix,CASE WHEN x.exact THEN x.doc END AS doc FROM (
    SELECT y.prefix,y.doc,(CASE WHEN y.prefix IS NULL THEN json(y.doc) ELSE json_replace(y.doc,'$.url',y.pfx||NEW.source_form) END)
     IS NEW.details_json AS exact
    FROM (SELECT u.n AS prefix,u.prefix AS pfx,
      jsonb(CASE WHEN u.n IS NULL THEN NEW.details_json ELSE json_replace(NEW.details_json,'$.url','') END) AS doc
     FROM (SELECT 1) one LEFT JOIN inventory_url_prefixes u
      ON json_extract(NEW.details_json,'$.url')=u.prefix||NEW.source_form) y) x) c
  LEFT JOIN inventory_attestation_details d ON length(c.doc)<=128 AND d.doc=c.doc;
END;
CREATE TRIGGER IF NOT EXISTS inventory_attestations_delete INSTEAD OF DELETE ON inventory_attestations BEGIN
 DELETE FROM inventory_attestation_rows WHERE prompt=OLD.prompt AND locator=OLD.locator
  AND snapshot=(SELECT n FROM inventory_snapshot_numbers WHERE snapshot_id=OLD.snapshot_id)
  AND role=(SELECT n FROM inventory_attestation_roles WHERE role=OLD.role);
END;
-- attestazioni:fine
CREATE VIEW IF NOT EXISTS inventory_source_counts AS
 SELECT s.source_key,s.name,count(*) AS attestations,
 count(DISTINCT a.prompt) AS distinct_prompts
 FROM inventory_sources s JOIN inventory_snapshots v ON v.source_key=s.source_key
 JOIN inventory_attestations a ON a.snapshot_id=v.id GROUP BY s.source_key;
CREATE VIEW IF NOT EXISTS inventory_pending_single_words AS
 SELECT t.* FROM inventory_terms t
 WHERE t.is_single_word=1 AND NOT EXISTS(SELECT 1 FROM prompts p WHERE p.lemma=t.prompt);
