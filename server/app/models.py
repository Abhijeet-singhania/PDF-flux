from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator


SchemaType = Literal["text", "int", "integer", "float", "date", "boolean", "bool"]


class ColumnSchema(BaseModel):
    name: str = Field(min_length=1)
    type: SchemaType


class TableSchema(BaseModel):
    table: str = Field(min_length=1)
    columns: list[ColumnSchema] = Field(min_length=1)


# ---------------------------------------------------------------------------
# DB connection request — discriminated union on `connector`
# ---------------------------------------------------------------------------

class PostgresConnectRequest(BaseModel):
    connector: Literal["postgres"] = "postgres"
    host: str
    port: int
    user: str
    password: str
    dbname: str

    # Keep backward-compat: old clients that sent `type` instead of `connector`
    # are handled at the router level.


class SupabaseConnectRequest(BaseModel):
    connector: Literal["supabase"] = "supabase"
    supabase_url: str = Field(description="Supabase project URL, e.g. https://xxxx.supabase.co")
    supabase_key: str = Field(description="Supabase anon or service-role API key")


DBConnectRequest = Annotated[
    Union[PostgresConnectRequest, SupabaseConnectRequest],
    Field(discriminator="connector"),
]


# ---------------------------------------------------------------------------
# Legacy alias so existing imports don't break immediately
# ---------------------------------------------------------------------------
class _LegacyDBConnectRequest(BaseModel):
    """Accepted when connector/type is missing — treated as postgres."""
    host: str
    port: int
    user: str
    password: str
    dbname: str
    # Accept the old `type` field silently
    type: str | None = None


class DBColumnInfo(BaseModel):
    name: str
    type: str


class DBTableInfo(BaseModel):
    name: str
    columns: list[DBColumnInfo]


class DBConnectResponse(BaseModel):
    success: bool
    connectionId: str
    tables: list[DBTableInfo]


class PDFUploadResponse(BaseModel):
    fileId: str
    pageCount: int
    textExtracted: bool
    ocrUsed: bool = False


class AIProviderConfig(BaseModel):
    provider: Literal["groq", "gemini", "openai", "mistral"] = "groq"
    api_key: str | None = None
    model: str | None = None


class ExtractRequest(BaseModel):
    fileId: str
    schema_params: TableSchema = Field(alias="schema")
    pageRange: list[int] | None = None
    aiProvider: AIProviderConfig | None = None

    @field_validator("pageRange")
    @classmethod
    def validate_page_range(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        if len(value) != 2 or value[0] <= 0 or value[1] <= 0 or value[0] > value[1]:
            raise ValueError("pageRange must be [start, end] with positive values")
        return value


class RowWarning(BaseModel):
    index: int
    reason: str


class UsageStats(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class ExtractResponse(BaseModel):
    rows: list[dict[str, Any]]
    warnings: list[RowWarning]
    usage: UsageStats | None = None


class InsertRequest(BaseModel):
    connectionId: str
    table: str
    rows: list[dict[str, Any]]
    mode: Literal["insert", "upsert", "replace"] = "insert"


class InsertError(BaseModel):
    index: int
    error: str


class InsertResponse(BaseModel):
    inserted: int
    failed: int
    errors: list[InsertError]


def normalize_schema_type(schema_type: str) -> str:
    if schema_type == "integer":
        return "int"
    if schema_type == "bool":
        return "boolean"
    return schema_type


def coerce_value(value: Any, schema_type: str) -> Any:
    if value is None:
        return None

    normalized = normalize_schema_type(schema_type)
    if normalized == "text":
        return str(value)
    if normalized == "int":
        if isinstance(value, bool):
            raise ValueError("boolean cannot be coerced to int")
        return int(value)
    if normalized == "float":
        if isinstance(value, bool):
            raise ValueError("boolean cannot be coerced to float")
        return float(value)
    if normalized == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"true", "1", "yes", "y"}:
            return True
        if text in {"false", "0", "no", "n"}:
            return False
        raise ValueError("invalid boolean value")
    if normalized == "date":
        if isinstance(value, date):
            return value
        if isinstance(value, datetime):
            return value.date()
        text = str(value).strip()
        return date.fromisoformat(text)

    raise ValueError(f"unsupported schema type: {schema_type}")
