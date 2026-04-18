from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import MetaData, Table
import uuid

from app.models import InsertError, InsertRequest, InsertResponse
from app.services.db_service import build_supabase_client, create_db_engine
from app.state import db_connections

router = APIRouter(prefix="/api", tags=["insert"])


@router.post("/insert", response_model=InsertResponse)
def insert_rows(payload: InsertRequest) -> InsertResponse:
    if payload.mode != "insert":
        raise HTTPException(status_code=400, detail="Phase 1 supports mode='insert' only")

    conn = db_connections.get(payload.connectionId)
    if conn is None:
        raise HTTPException(status_code=404, detail="connectionId not found")

    if not payload.rows:
        return InsertResponse(inserted=0, failed=0, errors=[])

    # ------------------------------------------------------------------
    # Supabase insert path
    # ------------------------------------------------------------------
    if conn.connector == "supabase":
        return _insert_supabase(conn, payload)

    # ------------------------------------------------------------------
    # Postgres insert path (unchanged)
    # ------------------------------------------------------------------
    return _insert_postgres(conn, payload)


def _insert_supabase(conn, payload: InsertRequest) -> InsertResponse:
    try:
        client = build_supabase_client(conn.supabase_url, conn.supabase_key)  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to create Supabase client: {exc}") from exc

    errors: list[InsertError] = []
    inserted = 0

    for idx, row in enumerate(payload.rows):
        try:
            response = client.table(payload.table).insert(row).execute()
            # supabase-py raises on error; if data is empty something was wrong
            if not response.data:
                errors.append(InsertError(index=idx, error="No data returned from Supabase insert"))
            else:
                inserted += 1
        except Exception as exc:
            errors.append(InsertError(index=idx, error=str(exc)))

    return InsertResponse(inserted=inserted, failed=len(errors), errors=errors)


def _insert_postgres(conn, payload: InsertRequest) -> InsertResponse:
    engine = create_db_engine(conn.url)
    metadata = MetaData()
    schema = "public" if conn.db_type == "postgresql+psycopg" else None

    try:
        table = Table(payload.table, metadata, autoload_with=engine, schema=schema)
    except Exception as exc:
        engine.dispose()
        raise HTTPException(status_code=400, detail=f"Unable to load table '{payload.table}': {exc}") from exc

    errors: list[InsertError] = []
    inserted = 0

    try:
        with engine.begin() as connection:
            for idx, row in enumerate(payload.rows):
                filtered_row = {key: row.get(key) for key in table.columns.keys() if key in row}

                # Inject UUID for 'id' column if missing but required by table schema
                if 'id' in table.columns.keys() and 'id' not in filtered_row:
                    col_type = str(table.columns['id'].type).lower()
                    if 'uuid' in col_type or 'char' in col_type or 'text' in col_type:
                        filtered_row['id'] = str(uuid.uuid4())

                try:
                    connection.execute(table.insert().values(**filtered_row))
                    inserted += 1
                except Exception as row_exc:
                    errors.append(InsertError(index=idx, error=str(row_exc)))
                    raise
    except Exception:
        engine.dispose()
        return InsertResponse(inserted=0, failed=len(payload.rows), errors=errors)

    engine.dispose()
    return InsertResponse(inserted=inserted, failed=0, errors=[])
