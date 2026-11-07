#!/usr/bin/env bash
# Re-run: needs /workspace/icon-restoration/.venv + FSRCNN model
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IR=/workspace/icon-restoration
source "$IR/.venv/bin/activate"
python "$IR/restore-and-emit-icons.py" --src-jpg "${1:-$IR/english-original.jpg}" --project english
# then manually emit into project (see RESTORE_METHOD.md) or use emit in that script extended
