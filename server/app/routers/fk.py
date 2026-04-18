from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.db_service import (
    build_supabase_client,
    create_db_engine,
    get_foreign_keys,
    get_table_rows,
    get_supabase_foreign_keys,
)
from app.state import db_connections

router = APIRouter(prefix="/api/db", tags=["fk"])


@router.get("/{connection_id}/foreign-keys")
def foreign_keys(connection_id: str, table: str = Query(..., min_length=1)) -> list[dict]:
    """Return FK constraints for the given table."""
    conn = db_connections.get(connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="connectionId not found")

    if conn.connector == "supabase":
        try:
            return get_supabase_foreign_keys(conn.supabase_url, conn.supabase_key, table)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Postgres path
    engine = create_db_engine(conn.url)
    try:
        fks = get_foreign_keys(engine, table)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        engine.dispose()
    
    return fks


@router.get("/{connection_id}/table-rows")
def table_rows(
    connection_id: str,
    table: str = Query(..., min_length=1),
    limit: int = 200,
) -> list[dict]:
    """Fetch up to `limit` rows from `table`."""
    conn = db_connections.get(connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="connectionId not found")

    if conn.connector == "supabase":
        try:
            client = build_supabase_client(conn.supabase_url, conn.supabase_key)  # type: ignore[arg-type]
            response = client.table(table).select("*").limit(limit).execute()
            return response.data or []
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase fetch failed: {exc}") from exc

    # Postgres path
    engine = create_db_engine(conn.url)
    try:
        rows = get_table_rows(engine, table, limit)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        engine.dispose()

    return rows
