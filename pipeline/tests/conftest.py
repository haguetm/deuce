"""Throwaway PostgreSQL cluster with the real migrations, for DB tests.

Skipped when PostgreSQL server binaries are not installed. Uses the same
Supabase emulation as scripts/db/test-plain-postgres.sh.
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _pg_bin() -> str | None:
    found = sorted(glob.glob("/usr/lib/postgresql/*/bin/initdb"))
    return str(Path(found[-1]).parent) if found else None


@pytest.fixture(scope="session")
def database_url():
    pg_bin = _pg_bin()
    if not pg_bin or not shutil.which("psql"):
        pytest.skip("PostgreSQL server binaries not available")
    work = Path(tempfile.mkdtemp())
    prefix: list[str] = []
    if os.geteuid() == 0:
        shutil.chown(work, "postgres")
        prefix = ["runuser", "-u", "postgres", "--"]
    port = "54398"
    subprocess.run([*prefix, f"{pg_bin}/initdb", "-D", f"{work}/data", "-U", "postgres", "--auth=trust"],
                   check=True, capture_output=True)
    subprocess.run([*prefix, f"{pg_bin}/pg_ctl", "-D", f"{work}/data", "-l", f"{work}/log",
                    "-o", f"-p {port} -k {work} -c listen_addresses=''", "start", "-w"],
                   check=True, capture_output=True)
    psql = ["psql", "-h", str(work), "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"]
    try:
        files = [ROOT / "scripts/db/supabase-shim.sql", *sorted((ROOT / "supabase/migrations").glob("*.sql")),
                 ROOT / "supabase/seed.sql"]
        for f in files:
            subprocess.run([*psql, "-f", str(f)], check=True, capture_output=True)
        yield f"host={work} port={port} user=postgres dbname=postgres"
    finally:
        subprocess.run([*prefix, f"{pg_bin}/pg_ctl", "-D", f"{work}/data", "stop", "-m", "immediate"],
                       capture_output=True)
        shutil.rmtree(work, ignore_errors=True)
