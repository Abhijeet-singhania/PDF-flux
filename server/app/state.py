from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class DBConnectionConfig:
    connection_id: str
    url: str
    db_type: str = "postgresql+psycopg"
    connector: str = "postgres"          # "postgres" | "supabase"
    supabase_url: str | None = None      # Supabase project URL
    supabase_key: str | None = None      # Supabase API key


@dataclass
class StoredPDF:
    file_id: str
    path: Path
    pages: list[str]


db_connections: dict[str, DBConnectionConfig] = {}
uploaded_pdfs: dict[str, StoredPDF] = {}
last_connection_id: str | None = None
jobs: dict[str, dict[str, Any]] = {}
