#!/usr/bin/env python3
"""Launcher di EuroDense-435M per ZeroContext.
Mettere questo file accanto a zerocontext_models_italiani.py.
"""
import sys
from zerocontext_models_italiani import main

if __name__ == "__main__":
    raise SystemExit(main(["--model", "eurodense", *sys.argv[1:]]))
