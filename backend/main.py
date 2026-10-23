import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Depends, status as http_status
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
    UserRegister,
    UserLogin,
    UserProfileResponse,
    TokenResponse,
)
from repository import get_repository, IReportRepository, MongoReportRepository
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_payload,
    get_optional_user_payload,
)

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


# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@app.post(
    "/api/auth/register",
    response_model=TokenResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Register a new citizen or officer account",
    tags=["Authentication"],
)
async def register(user_in: UserRegister) -> TokenResponse:
    """Creates a new user profile with salted bcrypt password hashing and returns a signed JWT."""
    existing = await repository.get_user_by_email(user_in.email)
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    try:
        hashed_pw = hash_password(user_in.password)
        created_user = await repository.create_user(user_in, hashed_pw)
        token, expires_in = create_access_token({
            "sub": created_user.id,
            "email": created_user.email,
            "role": created_user.role.value if hasattr(created_user.role, "value") else created_user.role,
            "name": created_user.name,
            "ward": created_user.ward,
        })
        return TokenResponse(
            access_token=token,
            expires_in=expires_in,
            user=created_user,
        )
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)[:120]}",
        )


@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
    tags=["Authentication"],
)
async def login(credentials: UserLogin) -> TokenResponse:
    """Verifies credentials against MongoDB and issues a signed, expiring access token."""
    user_doc = await repository.get_user_by_email(credentials.email)
    if not user_doc or not verify_password(credentials.password, user_doc.get("hashed_password", "")):
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_profile = await repository.get_user_by_id(user_doc["id"])
    if not user_profile:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User account record could not be loaded.",
        )

    token, expires_in = create_access_token({
        "sub": user_profile.id,
        "email": user_profile.email,
        "role": user_profile.role.value if hasattr(user_profile.role, "value") else user_profile.role,
        "name": user_profile.name,
        "ward": user_profile.ward,
    })

    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=user_profile,
    )


@app.get(
    "/api/auth/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
    tags=["Authentication"],
)
async def get_me(user_payload: dict = Depends(get_current_user_payload)) -> UserProfileResponse:
    """Protected endpoint: Returns the profile of the authenticated user."""
    user = await repository.get_user_by_id(user_payload["sub"])
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return user


# ==========================================
# REPORT ENDPOINTS
# ==========================================

@app.post(
    "/api/reports",
    response_model=ReportResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a civic issue report",
    tags=["Reports"],
)
async def create_report(
    report_in: ReportCreate,
    user_payload: Optional[dict] = Depends(get_optional_user_payload),
) -> ReportResponse:
    """
    Submits a new civic report to persistent MongoDB Atlas storage.
    If authenticated, automatically associates report with the submitting user ID.
    """
    try:
        if user_payload and not report_in.user_id:
            report_in.user_id = user_payload.get("sub")
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
    user_id: Optional[str] = Query(None, description="Filter reports submitted by a specific user"),
    ward: Optional[str] = Query(None, description="Filter reports by ward"),
) -> List[ReportResponse]:
    """Retrieves all reports stored in MongoDB, sorted newest first."""
    try:
        return await repository.list_all(category=category, status=status, user_id=user_id, ward=ward)
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
    "/api/reports/my",
    response_model=List[ReportResponse],
    summary="List reports created by the authenticated user",
    tags=["Reports"],
)
async def list_my_reports(
    user_payload: dict = Depends(get_current_user_payload),
) -> List[ReportResponse]:
    """Protected endpoint: Returns only the reports submitted by the logged-in user."""
    try:
        return await repository.list_all(user_id=user_payload["sub"])
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error retrieving user reports: {str(e)[:120]}",
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


@app.patch(
    "/api/reports/{report_id}/upvote",
    response_model=ReportResponse,
    summary="Highlight / upvote an existing report to escalate without duplicating",
    tags=["Reports"],
)
async def upvote_report(report_id: str) -> ReportResponse:
    """Increments community highlight / upvote count for a report in MongoDB."""
    try:
        updated = await repository.upvote(report_id)
        if not updated:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Report with ID '{report_id}' was not found to highlight.",
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
            detail=f"Database error while highlighting report: {str(e)[:120]}",
        )
