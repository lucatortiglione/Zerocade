"""Filtro condiviso dei candidati; non costituisce revisione semantica."""
from validate_word_association_it_v3_6_0 import GENERIC_LEMMAS

POSSESSIVES=frozenset('mio mia miei mie tuo tua tuoi tue suo sua suoi sue nostro nostra nostri nostre vostro vostra vostri vostre loro altrui'.split())
GRAMMATICAL_WORDS=POSSESSIVES|frozenset('il lo gli le un uno una di del dello della dei degli delle a ad al allo alla ai agli alle da dal dallo dalla dai dagli dalle in nel nello nella nei negli nelle con su sul sullo sulla sui sugli sulle per tra fra che cui questo questa questi queste quello quella quelli quelle esso essa essi esse io tu egli ella noi voi loro'.split())
STOP_ASSOCIATIONS=GENERIC_LEMMAS|GRAMMATICAL_WORDS
