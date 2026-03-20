#!/bin/bash
set -e  # zastaví skript při chybě

git add .

git commit -m "dev update" || echo "Nothing to commit"

git push