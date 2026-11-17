#!/usr/bin/env python3
"""Launcher di BGE-M3 Italian per ZeroContext.
Mettere questo file accanto a zerocontext_models_italiani.py.
"""
import sys
from zerocontext_models_italiani import main

if __name__ == "__main__":
    raise SystemExit(main(["--model", "bge-m3-italian", *sys.argv[1:]]))
