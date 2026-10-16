"""Run journal: a log file per run plus a JSON list of data issues.

Issues (missing photo, rejected license, unmatched stats...) are expected and
reviewed by hand; they feed the "missing or uncertain data" section of
docs/DATA.md.
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"


class Journal:
    def __init__(self, command: str, log_dir: Path = LOG_DIR) -> None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        log_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = log_dir / f"{stamp}-{command}.log"
        self.issues_path = log_dir / f"{stamp}-{command}-issues.json"
        self.issues: list[dict] = []
        self.counters: Counter[str] = Counter()

        self.logger = logging.getLogger(f"deuce.{command}.{stamp}")
        self.logger.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        for handler in (logging.FileHandler(self.log_path), logging.StreamHandler()):
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def info(self, message: str, *args) -> None:
        self.logger.info(message, *args)

    def count(self, key: str, n: int = 1) -> None:
        self.counters[key] += n

    def issue(self, kind: str, qid: str | None, detail: str) -> None:
        self.issues.append({"kind": kind, "qid": qid, "detail": detail})
        self.counters[f"issue.{kind}"] += 1

    def close(self) -> dict:
        self.issues_path.write_text(json.dumps(self.issues, ensure_ascii=False, indent=2))
        summary = dict(sorted(self.counters.items()))
        self.info("summary %s", json.dumps(summary))
        print(format_summary(summary, self.log_path, self.issues_path, len(self.issues)))
        return summary


def format_summary(summary: dict, log_path: Path, issues_path: Path, issue_count: int) -> str:
    """Human-readable end-of-run block."""
    width = max((len(k) for k in summary), default=10)
    lines = ["", "=" * 60, "Run summary", "-" * 60]
    lines += [f"  {key.ljust(width)}  {value}" for key, value in summary.items()]
    lines += [
        "-" * 60,
        f"  issues: {issue_count} written to {issues_path}",
        f"  log:    {log_path}",
        "=" * 60,
    ]
    return "\n".join(lines)
