from __future__ import annotations

from urllib.parse import quote_plus

import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.models import DBTableInfo


# ---------------------------------------------------------------------------
# PostgreSQL helpers (unchanged)
# ---------------------------------------------------------------------------

def build_postgres_url(host: str, port: int, user: str, password: str, dbname: str) -> str:
    return (
        f"postgresql+psycopg://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{quote_plus(dbname)}"
    )


def create_db_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, future=True)


def introspect_public_tables(engine: Engine) -> list[DBTableInfo]:
    tables_sql = text(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
        """
    )
    columns_sql = text(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :table_name
        ORDER BY ordinal_position;
        """
    )

    output: list[DBTableInfo] = []
    with engine.connect() as conn:
        table_names = [row[0] for row in conn.execute(tables_sql).fetchall()]
        for table_name in table_names:
            columns = [
                {"name": row[0], "type": row[1]}
                for row in conn.execute(columns_sql, {"table_name": table_name}).fetchall()
            ]
            output.append(DBTableInfo(name=table_name, columns=columns))

    return output


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def build_supabase_client(supabase_url: str, supabase_key: str):  # type: ignore[return]
    """Return an initialised supabase-py Client."""
    try:
        from supabase import create_client  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "supabase-py is not installed. Run: pip install supabase>=2.0.0"
        ) from exc
    return create_client(supabase_url.rstrip("/"), supabase_key)


def introspect_supabase_tables(supabase_url: str, supabase_key: str) -> list[DBTableInfo]:
    """
    Introspect public tables via the PostgREST OpenAPI spec endpoint.

    The endpoint `GET /rest/v1/` returns an OpenAPI 2.0 JSON document that
    describes all table-level paths and their column schemas.
    """
    rest_base = supabase_url.rstrip("/") + "/rest/v1/"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }

    try:
        response = httpx.get(rest_base, headers=headers, timeout=10)
        response.raise_for_status()
        spec = response.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"Supabase introspection failed (HTTP {exc.response.status_code}): {exc.response.text}"
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"Supabase introspection error: {exc}") from exc

    # Parse the OpenAPI 2.0 definitions → columns
    definitions: dict = spec.get("definitions", {})
    paths: dict = spec.get("paths", {})

    # Collect table names from paths (each path like "/my_table" with a GET)
    table_names: list[str] = []
    for path_key in paths:
        name = path_key.lstrip("/")
        if name and name in definitions:
            table_names.append(name)

    output: list[DBTableInfo] = []
    for table_name in sorted(table_names):
        defn = definitions.get(table_name, {})
        props: dict = defn.get("properties", {})
        columns = [{"name": col, "type": info.get("format") or info.get("type", "text")} for col, info in props.items()]
        output.append(DBTableInfo(name=table_name, columns=columns))

    return output


# ---------------------------------------------------------------------------
# FK introspection + table row fetching (Postgres)
# ---------------------------------------------------------------------------

def get_foreign_keys(engine: Engine, table_name: str) -> list[dict]:
    """
    Return FK constraints for a table:
      [{ fk_column, referenced_table, referenced_column }]
    """
    sql = text(
        """
        SELECT
            kcu.column_name          AS fk_column,
            ccu.table_name           AS referenced_table,
            ccu.column_name          AS referenced_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema   = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema    = 'public'
          AND tc.table_name      = :table_name
        ORDER BY kcu.column_name;
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(sql, {"table_name": table_name}).fetchall()
    return [
        {"fk_column": r[0], "referenced_table": r[1], "referenced_column": r[2]}
        for r in rows
    ]


def get_table_rows(engine: Engine, table_name: str, limit: int = 200) -> list[dict]:
    """Fetch up to `limit` rows from a public table as plain dicts."""
    # table_name is validated (alphanumeric + underscore) by the router before reaching here.
    sql = text(f'SELECT * FROM public."{table_name}" LIMIT :limit')  # noqa: S608
    with engine.connect() as conn:
        result = conn.execute(sql, {"limit": limit})
        keys = list(result.keys())
        return [dict(zip(keys, row)) for row in result.fetchall()]


def get_supabase_foreign_keys(supabase_url: str, supabase_key: str, table_name: str) -> list[dict]:
    """
    Introspect foreign keys from Supabase's PostgREST OpenAPI spec.
    PostgREST often embeds FK info in the property description like:
    "Note:\\nThis is a Foreign Key to `referenced_table.referenced_column`."
    """
    import re
    import httpx

    rest_base = supabase_url.rstrip("/") + "/rest/v1/"
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}

    try:
        response = httpx.get(rest_base, headers=headers, timeout=10)
        response.raise_for_status()
        spec = response.json()
    except Exception:
        return []

    definitions = spec.get("definitions", {})
    # OpenAPI paths are sometimes singular/plural customized, but definition keys usually match the table.
    # We look directly for the exact table name in definitions.
    table_def = definitions.get(table_name, {})
    properties = table_def.get("properties", {})

    # Regex to match common PostgREST FK description: Foreign Key to `table.column`
    # Also catches <fk table='...' column='...'/> if present
    fk_list = []
    
    fk_regex_1 = re.compile(r"Foreign Key to `(?:[^.`]+\.)?([^.`]+)\.([^.`]+)`", re.IGNORECASE)
    fk_regex_2 = re.compile(r"<fk table='([^']+)' column='([^']+)'/>", re.IGNORECASE)

    for col_name, prop_info in properties.items():
        desc = prop_info.get("description", "")
        if not desc:
            continue
            
        # Try finding explicit HTML-like tag first
        m2 = fk_regex_2.search(desc)
        if m2:
            fk_list.append({
                "fk_column": col_name,
                "referenced_table": m2.group(1),
                "referenced_column": m2.group(2)
            })
            continue
            
        # Try finding the Markdown-like text
        m1 = fk_regex_1.search(desc)
        if m1:
            fk_list.append({
                "fk_column": col_name,
                "referenced_table": m1.group(1),
                "referenced_column": m1.group(2)
            })
            
    return fk_list


