#!/usr/bin/env bash
set -euo pipefail

PHP_BIN="${PHP_BIN:-$(command -v php || echo php)}"

echo "== PHP =="
"$PHP_BIN" -v
"$PHP_BIN" -m | sort | head -n 50 || true

echo
echo "== FUZZ (small) =="
"$PHP_BIN" tests/fuzz/fuzz.php --cases=300 --seed=42

echo
echo "== FUZZ (seeds 7,11,29) =="
for s in 7 11 29; do
echo ">>> seed=$s"
"$PHP_BIN" tests/fuzz/fuzz.php --cases=800 --seed=$s
done

echo
echo "== FIXTURES =="
if [ -f scripts/run_tests.py ]; then
python3 scripts/run_tests.py
else
echo "runner not available"
fi

echo
echo "All checks done."

bash
