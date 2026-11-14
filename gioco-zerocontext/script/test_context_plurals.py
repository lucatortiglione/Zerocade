import unittest

from build_context_plurals import noun_plurals


class NounPluralsTests(unittest.TestCase):
    def test_regular_and_irregular_nouns_including_gender_change(self):
        text = "\n".join([
            "gatto\tgatto\tNOUN-M:s", "gatti\tgatto\tNOUN-M:p",
            "uovo\tuovo\tNOUN-M:s", "uova\tuovo\tNOUN-F:p",
            "uomo\tuomo\tNOUN-M:s", "uomini\tuomo\tNOUN-M:p",
            "braccio\tbraccio\tNOUN-M:s", "bracci\tbraccio\tNOUN-M:p",
            "braccia\tbraccio\tNOUN-F:p", "bracci\tbraccio\tNOUN-M:p",
        ])
        self.assertEqual(noun_plurals(text), {
            "braccio": ["bracci", "braccia"], "gatto": ["gatti"],
            "uomo": ["uomini"], "uovo": ["uova"],
        })

    def test_only_attested_singular_nouns_have_aliases(self):
        text = "\n".join([
            "casi\tcase\tNOUN-M:p",  # No singular noun 'case' attested.
            "rosso\trosso\tADJ:m+s", "rossi\trosso\tADJ:m+p",
            "vedere\tvedere\tVER:infi", "vedono\tvedere\tVER:pres+ind+3+p",
            "città\tcittà\tNOUN-F:s", "città\tcittà\tNOUN-F:p",
            "Nome\tNome\tNOUN-M:s", "Nomi\tNome\tNOUN-M:p",
            "invalid row",
        ])
        self.assertEqual(noun_plurals(text), {})


if __name__ == "__main__":
    unittest.main()
