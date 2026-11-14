PRAGMA user_version = 1;

CREATE TABLE sources(
 id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE languages(
 id INTEGER PRIMARY KEY,
 code TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE categories(
 id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE difficulties(
 id INTEGER PRIMARY KEY,
 name TEXT NOT NULL UNIQUE CHECK(name IN ('easy','medium','hard'))
) STRICT;

CREATE TABLE entries(
 id INTEGER PRIMARY KEY,
 ref TEXT NOT NULL UNIQUE CHECK(length(ref)>0),
 source_id INTEGER NOT NULL REFERENCES sources(id),
 language_id INTEGER NOT NULL REFERENCES languages(id),
 category_id INTEGER NOT NULL REFERENCES categories(id),
 difficulty_id INTEGER NOT NULL REFERENCES difficulties(id),
 clue TEXT NOT NULL CHECK(length(clue)>0),
 answer TEXT NOT NULL CHECK(length(answer)>0)
) STRICT;

CREATE TABLE accepted_answers(
 entry_id INTEGER NOT NULL REFERENCES entries(id),
 position INTEGER NOT NULL CHECK(position>=0),
 answer TEXT NOT NULL CHECK(length(answer)>0),
 PRIMARY KEY(entry_id,position)
) STRICT, WITHOUT ROWID;

CREATE TABLE metadata(
 name TEXT PRIMARY KEY,
 value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- L'ordine del CSV e tutti i suoi campi restano ricostruibili senza copie.
CREATE VIEW csv_entries AS
 SELECT e.id-1 AS position,e.ref,s.name AS source,l.code AS language,
 c.name AS category,d.name AS difficulty,e.clue,e.answer,
 coalesce((SELECT group_concat(answer,'|') FROM (
  SELECT a.answer FROM accepted_answers a WHERE a.entry_id=e.id ORDER BY a.position
 )), '') AS also_accept
 FROM entries e
 JOIN sources s ON s.id=e.source_id
 JOIN languages l ON l.id=e.language_id
 JOIN categories c ON c.id=e.category_id
 JOIN difficulties d ON d.id=e.difficulty_id;
