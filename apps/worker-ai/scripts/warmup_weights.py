#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
APP_ROOT = SCRIPT_DIR.parent
SRC_ROOT = APP_ROOT / "src"

if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from weights import list_supported_models, warmup_all_models  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Warm up and validate ML model weights.")
    parser.add_argument("--check-only", action="store_true", help="Only validate cached weights.")
    parser.add_argument("--strict", action="store_true", help="Exit with code 1 if any model is missing or incomplete.")
    parser.add_argument("--download", action="store_true", help="Download missing weights.")
    parser.add_argument(
        "--cache-dir",
        default=os.getenv("MODEL_CACHE_DIR", "/weights"),
        help="Model cache directory. Defaults to MODEL_CACHE_DIR or /weights.",
    )
    parser.add_argument(
        "--models",
        nargs="*",
        help="Optional subset of model keys to process.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.check_only and args.download:
        print("Cannot use --check-only and --download together.", file=sys.stderr)
        return 2

    selected_models = args.models or list_supported_models()

    try:
        results = warmup_all_models(
            cache_dir=args.cache_dir,
            download_if_missing=args.download and not args.check_only,
            models=selected_models,
        )
    except Exception as exc:
        print(f"Weight warmup failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False, sort_keys=True))
    else:
        for model_key, status in results.items():
            state = "cached" if status["isCached"] else "missing"
            print(
                f"{model_key}: {state} | "
                f"found={status['foundFiles']} | "
                f"missing={status['missingFiles']} | "
                f"size_mb={status['totalSizeMb']} | "
                f"min_expected_mb={status['minExpectedSizeMb']}"
            )

    if args.strict:
        if any(not status["isCached"] for status in results.values()):
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
