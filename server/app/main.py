from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.db import router as db_router
from app.routers.extract import router as extract_router
from app.routers.insert import router as insert_router
from app.routers.pdf import router as pdf_router
from app.routers.fk import router as fk_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s:\t  %(message)s")

app = FastAPI(title="PDF to DB Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(db_router)
app.include_router(pdf_router)
app.include_router(extract_router)
app.include_router(insert_router)
app.include_router(fk_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

