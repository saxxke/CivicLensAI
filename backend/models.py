from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class IssueCategory(str, Enum):
    ROAD_DAMAGE = "Road Damage"
    GARBAGE = "Garbage"
    BROKEN_STREETLIGHT = "Broken Streetlight"
    WATERLOGGING = "Waterlogging"
    WATER_SUPPLY = "Water Supply"
    OTHER = "Other"


class ReportStatus(str, Enum):
    REPORTED = "Reported"
    UNDER_REVIEW = "Under Review"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    REJECTED = "Rejected"


class SuggestedPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class ReportCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=120, description="Brief summary of the issue")
    description: str = Field(..., min_length=5, max_length=2000, description="Detailed explanation of the problem")
    category: IssueCategory = Field(default=IssueCategory.OTHER, description="Civic category")
    location: str = Field(..., min_length=3, max_length=200, description="Manual street, landmark, or area")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Geographic latitude coordinate")
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Geographic longitude coordinate")
    ward: Optional[str] = Field(default="Downtown Ward 14", max_length=100, description="Ward or jurisdiction")
    suggested_priority: Optional[SuggestedPriority] = Field(
        default=SuggestedPriority.MEDIUM,
        description="Suggested priority level (AI advisory or user assigned)",
    )
    image_url: Optional[str] = Field(
        default=None,
        description="Optional image attachment URL or data identifier",
    )
    user_id: Optional[str] = Field(default=None, description="Optional submitting user ID")


class ReportStatusUpdate(BaseModel):
    status: ReportStatus = Field(..., description="New status for the civic issue report")


class ReportResponse(BaseModel):
    id: str = Field(..., description="Unique generated report identifier (e.g., CL-1001)")
    title: str
    description: str
    category: IssueCategory
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ward: Optional[str] = "Downtown Ward 14"
    suggested_priority: SuggestedPriority
    status: ReportStatus
    upvotes: int = Field(default=0, description="Community highlight / upvote count")
    image_url: Optional[str] = None
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_mock_persistence: bool = Field(
        default=False,
        description="Indicates whether data is in temporary RAM (True) or persistent MongoDB (False)",
    )


class UserRole(str, Enum):
    CITIZEN = "Citizen"
    WARD_OFFICER = "Ward Officer"


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=80, description="Full name")
    email: str = Field(..., min_length=5, max_length=120, description="Unique email address")
    password: str = Field(..., min_length=6, max_length=128, description="Secure user password")
    role: UserRole = Field(default=UserRole.CITIZEN, description="User role")
    ward: str = Field(default="Downtown Ward 14", max_length=100, description="Ward or jurisdiction")


class UserLogin(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    ward: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfileResponse


class DatabaseHealth(BaseModel):
    status: str = Field(..., description="connected, disconnected, or error")
    engine: str = Field(..., description="mongodb or in-memory")
    database: Optional[str] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    timestamp: datetime
    persistence_mode: str
    database: Optional[DatabaseHealth] = None
