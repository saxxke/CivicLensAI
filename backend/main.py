import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, status as http_status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Explicitly load backend/.env if present, otherwise fallback to standard search
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")
load_dotenv()

from models import (
    HealthResponse,
    ReportCreate,
    ReportResponse,
    ReportStatusUpdate,
    IssueCategory,
    ReportStatus,
    DatabaseHealth,
)
from repository import get_repository, IReportRepository, MongoReportRepository

# Application environment
APP_ENV = os.getenv("APP_ENV", "development")
cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19000,http://localhost:19006,http://localhost:3000",
)
ALLOWED_ORIGINS = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
SEED_SAMPLE_DATA = os.getenv("SEED_SAMPLE_DATA", "false").lower() in ("true", "1", "yes")

# Global repository handle
repository: IReportRepository = get_repository()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Context Manager:
    Initializes database indexes, verifies connection on startup, and cleanly closes connections on shutdown.
    """
    global repository
    repository = get_repository()

    if isinstance(repository, MongoReportRepository):
        try:
            await repository.initialize()
            print("INFO:     Connected to MongoDB Atlas successfully.")
            if SEED_SAMPLE_DATA:
                seeded = await repository.seed_sample_data_if_empty()
                if seeded > 0:
                    print(f"INFO:     Seeded {seeded} initial sample reports into MongoDB.")
        except Exception as e:
            print(f"WARNING:  Failed to initialize MongoDB connection at startup: {e}")

    yield

    # Clean shutdown
    if repository:
        await repository.close()
        print("INFO:     MongoDB connection closed.")


app = FastAPI(
    title="CivicLens AI API",
    description=(
        "Backend API for CivicLens AI civic issue reporting and analysis.\n\n"
        "Configured with persistent **MongoDB Atlas** document storage for civic reports."
    ),
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    tags=["System"],
)
async def get_health() -> HealthResponse:
    """
    Confirms the API service status and accurately reports MongoDB connectivity.
    Returns HTTP 200 with database health details.
    """
    db_health: DatabaseHealth = await repository.check_health()
    overall_status = "healthy" if db_health.status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        service="civiclens-ai-backend",
        version="1.1.0",
        environment=APP_ENV,
        timestamp=datetime.now(timezone.utc),
        persistence_mode="MongoDB Atlas",
        database=db_health,
    )


@app.post(
    "/api/reports",
    response_model=ReportResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a civic issue report",
    tags=["Reports"],
)
async def create_report(report_in: ReportCreate) -> ReportResponse:
    """
    Submits a new civic report to persistent MongoDB Atlas storage.
    Validates required fields and assigns a safe atomic sequential reference ID (e.g. CL-1004).
    """
    try:
        created = await repository.create(report_in)
        return created
    except RuntimeError as re:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while creating report: {str(e)[:120]}",
        )


@app.get(
    "/api/reports",
    response_model=List[ReportResponse],
    summary="List civic issue reports",
    tags=["Reports"],
)
async def list_reports(
    category: Optional[IssueCategory] = Query(None, description="Filter reports by civic category"),
    status: Optional[ReportStatus] = Query(None, description="Filter reports by current workflow status"),
) -> List[ReportResponse]:
    """Retrieves all reports stored in MongoDB, sorted newest first."""
    try:
        return await repository.list_all(category=category, status=status)
    except RuntimeError as re:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while listing reports: {str(e)[:120]}",
        )


@app.get(
    "/api/reports/{report_id}",
    response_model=ReportResponse,
    summary="Retrieve report by ID",
    tags=["Reports"],
)
async def get_report(report_id: str) -> ReportResponse:
    """Fetches full details of a specific report using its identifier (e.g., CL-1001)."""
    try:
        report = await repository.get_by_id(report_id)
        if not report:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' was not found in MongoDB.",
            )
        return report
    except HTTPException:
        raise
    except RuntimeError as re:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while retrieving report: {str(e)[:120]}",
        )


@app.patch(
    "/api/reports/{report_id}/status",
    response_model=ReportResponse,
    summary="Update report workflow status",
    tags=["Reports"],
)
async def update_report_status(report_id: str, status_update: ReportStatusUpdate) -> ReportResponse:
    """Updates the workflow status of a report in MongoDB."""
    try:
        updated = await repository.update_status(report_id, status_update.status)
        if not updated:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' was not found to update status.",
            )
        return updated
    except HTTPException:
        raise
    except RuntimeError as re:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while updating report status: {str(e)[:120]}",
        )
