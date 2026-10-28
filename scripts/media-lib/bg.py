#!/usr/bin/env python3
"""Run a command fully detached (double fork) with output to a log: bg.py LOG cmd..."""
import os, sys
log, cmd = sys.argv[1], sys.argv[2:]
if os.fork() == 0:
    os.setsid()
    if os.fork() == 0:
        fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        os.dup2(fd, 1); os.dup2(fd, 2)
        os.execvp(cmd[0], cmd)
    os._exit(0)
