#!/usr/bin/env python3
"""Preview the launch film's procedural music bed on its own -> music.wav (the film itself calls make_music directly)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
from ofmedia import make_music, write_wav

music, info = make_music(55, seed=2026, bpm=88, key=9, lead='rhodes', pad_bright=4, intro=3.0, outro=3.5, density=0.7, beat_start=12.0, beat_end=52.0)
write_wav('music.wav', music)
print('music.wav', info)
