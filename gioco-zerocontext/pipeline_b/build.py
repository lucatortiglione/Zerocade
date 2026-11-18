"""CLI della Pipeline B: stesso comando di pipeline_a/build.py con backend fastText.

  python pipeline_b/build.py build | query <lemma> | export
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline_a.build import main  # noqa: E402

if __name__ == '__main__':
    argv = sys.argv[1:]
    main(argv[:1] + ['--backend', 'fasttext'] + argv[1:])
