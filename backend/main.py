import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "akp_inventory")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

app = FastAPI(title="AKP Auxiliary Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)

_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)


@app.get("/")
def root():
    return {"service": "backend (python)", "status": "ok"}


@app.get("/health")
def health():
    try:
        _client.admin.command("ping")
        database_status = "ok"
    except PyMongoError:
        database_status = "unreachable"

    return {
        "status": "ok",
        "database": database_status,
        "time": datetime.now(timezone.utc).isoformat(),
    }
