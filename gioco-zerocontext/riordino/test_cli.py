"""La configurazione standard del riordino: modello lineare, 1000 vicini dei vettori e segnali nuovi."""
import unittest

from riordino.cli import build_parser


class DefaultsTest(unittest.TestCase):
    def parse(self, *extra):
        return build_parser().parse_args(['--out', 'x.json', *extra])

    def test_the_standard_is_linear_with_1000_neighbours_and_the_new_signals(self):
        args = self.parse()
        self.assertEqual((args.tipo, args.vicini, args.segnali, args.profilo), ('lineare', 1000, True, 'original'))
        self.assertFalse(args.con_associazioni)

    def test_the_earlier_variants_can_still_be_asked_for(self):
        args = self.parse('--vicini', '0', '--no-segnali', '--tipo', 'alberi')
        self.assertEqual((args.tipo, args.vicini, args.segnali), ('alberi', 0, False))


if __name__ == '__main__':
    unittest.main()
