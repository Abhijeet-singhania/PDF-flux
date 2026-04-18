from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request

from app.models import (
    CreateTableRequest,
    CreateTableResponse,
    DBConnectResponse,
    PostgresConnectRequest,
    SupabaseConnectRequest
)
from app.services.db_service import (
    build_database_url,
    build_supabase_client,
    create_db_engine,
    create_table_from_schema,
    introspect_supabase_tables,
    introspect_tables,
)
from app.state import DBConnectionConfig, db_connections

router = APIRouter(prefix="/api/db", tags=["db"])


@router.post("/connect", response_model=DBConnectResponse)
async def connect_db(request: Request) -> DBConnectResponse:
    """
    Accept either a PostgresConnectRequest or SupabaseConnectRequest.

    We parse the raw JSON body manually so we can fall back gracefully to
    the legacy shape (no `connector` field → treated as postgres).
    """
    body: dict = await request.json()

    # Determine connector type; default to "postgres" for backward compat
    connector = body.get("connector", "postgres")

    connection_id = str(uuid.uuid4())
    # ------------------------------------------------------------------
    # Supabase path
    # ------------------------------------------------------------------
    if connector == "supabase":
        try:
            payload = SupabaseConnectRequest(**body)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        try:
            tables = introspect_supabase_tables(payload.supabase_url, payload.supabase_key)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase connection failed: {exc}") from exc

        db_connections[connection_id] = DBConnectionConfig(
            connection_id=connection_id,
            url="",  # not used for supabase
            connector="supabase",
            supabase_url=payload.supabase_url,
            supabase_key=payload.supabase_key,
        )
        return DBConnectResponse(success=True, connectionId=connection_id, tables=tables)

    # ------------------------------------------------------------------
    # Postgres path (default / legacy)
    # ------------------------------------------------------------------
    try:
        payload = PostgresConnectRequest(**{k: v for k, v in body.items() if k != "type"})
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db_url = build_database_url(
        db_type=payload.type,
        host=payload.host,
        port=payload.port,
        user=payload.user,
        password=payload.password,
        dbname=payload.dbname,
    )

    try:
        engine = create_db_engine(db_url)
        tables = introspect_tables(engine)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Database connection failed: {exc}") from exc
    finally:
        try:
            engine.dispose()  # type: ignore[name-defined]
        except Exception:
            pass

    db_connections[connection_id] = DBConnectionConfig(
        connection_id=connection_id,
        url=db_url,
        db_type=payload.type,
        connector="postgres",
    )
    return DBConnectResponse(success=True, connectionId=connection_id, tables=tables)


@router.post("/tables", response_model=CreateTableResponse)
def create_table(payload: CreateTableRequest) -> CreateTableResponse:
    conn = db_connections.get(payload.connectionId)
    if conn is None:
        raise HTTPException(status_code=404, detail="connectionId not found")

    engine = create_db_engine(conn.url)

    try:
        table = create_table_from_schema(engine, payload.schema)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to create table: {exc}") from exc
    finally:
        engine.dispose()

    return CreateTableResponse(success=True, table=table)

