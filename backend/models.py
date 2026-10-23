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
    RESOLVED = "Resolved"


class SuggestedPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class ReportCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=120, description="Brief summary of the issue")
    description: str = Field(..., min_length=5, max_length=2000, description="Detailed explanation of the problem")
    category: IssueCategory = Field(default=IssueCategory.OTHER, description="Civic category")
    location: str = Field(..., min_length=3, max_length=200, description="Manual street, landmark, or area")
    suggested_priority: Optional[SuggestedPriority] = Field(
        default=SuggestedPriority.MEDIUM,
        description="Suggested priority level (AI advisory or user assigned)",
    )
    image_url: Optional[str] = Field(
        default=None,
        description="Optional image attachment URL or data identifier",
    )


class ReportStatusUpdate(BaseModel):
    status: ReportStatus = Field(..., description="New status for the civic issue report")


class ReportResponse(BaseModel):
    id: str = Field(..., description="Unique generated report identifier (e.g., CL-1001)")
    title: str
    description: str
    category: IssueCategory
    location: str
    suggested_priority: SuggestedPriority
    status: ReportStatus
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_mock_persistence: bool = Field(
        default=False,
        description="Indicates whether data is in temporary RAM (True) or persistent MongoDB (False)",
    )


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
