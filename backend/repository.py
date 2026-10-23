import os
import re
import secrets
from typing import List, Optional, Protocol, runtime_checkable
from datetime import datetime, timezone
import pymongo
from pymongo import AsyncMongoClient, ReturnDocument

from models import (
    ReportCreate,
    ReportResponse,
    ReportStatus,
    IssueCategory,
    SuggestedPriority,
    DatabaseHealth,
    UserRegister,
    UserProfileResponse,
    UserRole,
)

# Initial sample records for explicit / dev seeding (with verified Downtown Ward 14 landmark coordinates)
INITIAL_SAMPLE_REPORTS = [
    {
        "id": "CL-1001",
        "title": "Pothole on Main Road",
        "description": "Deep road crater causing heavy vehicular slowdowns near the junction.",
        "category": IssueCategory.ROAD_DAMAGE,
        "location": "Main Road",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "suggested_priority": SuggestedPriority.HIGH,
        "status": ReportStatus.REPORTED,
    },
    {
        "id": "CL-1002",
        "title": "Garbage Overflow",
        "description": "Community bins spilling onto the pavement, needs scheduled pickup.",
        "category": IssueCategory.GARBAGE,
        "location": "Market Street",
        "latitude": 28.6219,
        "longitude": 77.2144,
        "suggested_priority": SuggestedPriority.MEDIUM,
        "status": ReportStatus.UNDER_REVIEW,
    },
    {
        "id": "CL-1003",
        "title": "Broken Streetlight",
        "description": "Post pole flickering at night, creating dark spots near the park lane.",
        "category": IssueCategory.BROKEN_STREETLIGHT,
        "location": "Park Avenue",
        "latitude": 28.6080,
        "longitude": 77.2220,
        "suggested_priority": SuggestedPriority.LOW,
        "status": ReportStatus.RESOLVED,
    },
]


@runtime_checkable
class IReportRepository(Protocol):
    async def create(self, report_in: ReportCreate) -> ReportResponse:
        ...

    async def list_all(
        self,
        category: Optional[IssueCategory] = None,
        status: Optional[ReportStatus] = None,
        user_id: Optional[str] = None,
        ward: Optional[str] = None,
    ) -> List[ReportResponse]:
        ...

    async def get_by_id(self, report_id: str) -> Optional[ReportResponse]:
        ...

    async def update_status(self, report_id: str, new_status: ReportStatus) -> Optional[ReportResponse]:
        ...

    async def upvote(self, report_id: str) -> Optional[ReportResponse]:
        ...

    async def create_user(self, user_in: UserRegister, hashed_pw: str) -> UserProfileResponse:
        ...

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        ...

    async def get_user_by_id(self, user_id: str) -> Optional[UserProfileResponse]:
        ...

    async def check_health(self) -> DatabaseHealth:
        ...

    async def close(self) -> None:
        ...


class MongoReportRepository:
    """
    Persistent MongoDB Atlas repository using PyMongo AsyncMongoClient.
    
    Features:
    - Atomically generates safe sequential identifiers (e.g., CL-1004) using a counters collection.
    - Preserves existing report format, timestamps, and schema compatibility.
    - Supports real user accounts and password hashes.
    - Stores coordinates (latitude/longitude) for real heatmap rendering.
    """

    def __init__(self, uri: str, db_name: str = "civiclens"):
        self.uri = uri
        self.db_name = db_name
        self.client: Optional[AsyncMongoClient] = AsyncMongoClient(
            self.uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )
        self.db = self.client[self.db_name]
        self.reports_col = self.db["reports"]
        self.counters_col = self.db["counters"]
        self.users_col = self.db["users"]

    async def initialize(self):
        """Initializes collections and indexes once connection is verified."""
        await self.reports_col.create_index([("id", pymongo.ASCENDING)], unique=True)
        await self.reports_col.create_index([("created_at", pymongo.DESCENDING)])
        await self.users_col.create_index([("email", pymongo.ASCENDING)], unique=True)

        # Ensure sequence counter initialized to at least 1003 if not present
        existing_counter = await self.counters_col.find_one({"_id": "report_id"})
        if not existing_counter:
            highest_num = 1003
            async for doc in self.reports_col.find({}, {"id": 1}):
                match = re.search(r"CL-(\d+)", doc.get("id", ""), re.IGNORECASE)
                if match:
                    val = int(match.group(1))
                    if val > highest_num:
                        highest_num = val

            await self.counters_col.update_one(
                {"_id": "report_id"},
                {"$setOnInsert": {"seq": highest_num}},
                upsert=True,
            )

    async def seed_sample_data_if_empty(self) -> int:
        """Seeds initial sample reports (CL-1001, CL-1002, CL-1003) if empty."""
        count = await self.reports_col.count_documents({})
        if count > 0:
            return 0

        now = datetime.now(timezone.utc)
        inserted_count = 0
        for sample in INITIAL_SAMPLE_REPORTS:
            doc = {
                "id": sample["id"],
                "title": sample["title"],
                "description": sample["description"],
                "category": sample["category"].value if hasattr(sample["category"], "value") else sample["category"],
                "location": sample["location"],
                "latitude": sample.get("latitude"),
                "longitude": sample.get("longitude"),
                "ward": sample.get("ward", "Downtown Ward 14"),
                "suggested_priority": (
                    sample["suggested_priority"].value
                    if hasattr(sample["suggested_priority"], "value")
                    else sample["suggested_priority"]
                ),
                "status": sample["status"].value if hasattr(sample["status"], "value") else sample["status"],
                "upvotes": sample.get("upvotes", 0),
                "image_url": None,
                "user_id": None,
                "created_at": now,
                "updated_at": now,
                "is_mock_persistence": False,
            }
            await self.reports_col.update_one(
                {"id": sample["id"]},
                {"$setOnInsert": doc},
                upsert=True,
            )
            inserted_count += 1

        return inserted_count

    async def _get_next_sequence_value(self) -> str:
        result = await self.counters_col.find_one_and_update(
            {"_id": "report_id"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        seq_num = result.get("seq", 1004)
        return f"CL-{seq_num}"

    def _doc_to_response(self, doc: dict) -> ReportResponse:
        doc.pop("_id", None)
        return ReportResponse(
            id=doc["id"],
            title=doc["title"],
            description=doc["description"],
            category=IssueCategory(doc["category"]),
            location=doc["location"],
            latitude=doc.get("latitude"),
            longitude=doc.get("longitude"),
            ward=doc.get("ward", "Downtown Ward 14"),
            suggested_priority=SuggestedPriority(doc["suggested_priority"]),
            status=ReportStatus(doc["status"]),
            upvotes=doc.get("upvotes", 0),
            image_url=doc.get("image_url"),
            user_id=doc.get("user_id"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            is_mock_persistence=False,
        )

    async def create(self, report_in: ReportCreate) -> ReportResponse:
        report_id = await self._get_next_sequence_value()
        now = datetime.now(timezone.utc)

        doc = {
            "id": report_id,
            "title": report_in.title,
            "description": report_in.description,
            "category": report_in.category.value if hasattr(report_in.category, "value") else report_in.category,
            "location": report_in.location,
            "latitude": report_in.latitude,
            "longitude": report_in.longitude,
            "ward": report_in.ward or "Downtown Ward 14",
            "suggested_priority": (
                (report_in.suggested_priority or SuggestedPriority.MEDIUM).value
                if hasattr(report_in.suggested_priority or SuggestedPriority.MEDIUM, "value")
                else (report_in.suggested_priority or SuggestedPriority.MEDIUM)
            ),
            "status": ReportStatus.REPORTED.value,
            "upvotes": 0,
            "image_url": report_in.image_url,
            "user_id": report_in.user_id,
            "created_at": now,
            "updated_at": now,
            "is_mock_persistence": False,
        }

        await self.reports_col.insert_one(doc)
        return self._doc_to_response(doc)

    async def list_all(
        self,
        category: Optional[IssueCategory] = None,
        status: Optional[ReportStatus] = None,
        user_id: Optional[str] = None,
        ward: Optional[str] = None,
    ) -> List[ReportResponse]:
        query = {}
        if category:
            query["category"] = category.value if hasattr(category, "value") else category
        if status:
            query["status"] = status.value if hasattr(status, "value") else status
        if user_id:
            query["user_id"] = user_id
        if ward:
            query["ward"] = ward

        cursor = self.reports_col.find(query).sort("created_at", pymongo.DESCENDING)
        reports: List[ReportResponse] = []
        async for doc in cursor:
            reports.append(self._doc_to_response(doc))
        return reports

    async def get_by_id(self, report_id: str) -> Optional[ReportResponse]:
        pattern = re.compile(f"^{re.escape(report_id)}$", re.IGNORECASE)
        doc = await self.reports_col.find_one({"id": {"$regex": pattern}})
        if not doc:
            return None
        return self._doc_to_response(doc)

    async def update_status(self, report_id: str, new_status: ReportStatus) -> Optional[ReportResponse]:
        pattern = re.compile(f"^{re.escape(report_id)}$", re.IGNORECASE)
        now = datetime.now(timezone.utc)
        status_val = new_status.value if hasattr(new_status, "value") else new_status

        updated_doc = await self.reports_col.find_one_and_update(
            {"id": {"$regex": pattern}},
            {
                "$set": {
                    "status": status_val,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if not updated_doc:
            return None
        return self._doc_to_response(updated_doc)

    async def upvote(self, report_id: str) -> Optional[ReportResponse]:
        pattern = re.compile(f"^{re.escape(report_id)}$", re.IGNORECASE)
        now = datetime.now(timezone.utc)

        updated_doc = await self.reports_col.find_one_and_update(
            {"id": {"$regex": pattern}},
            {
                "$inc": {"upvotes": 1},
                "$set": {"updated_at": now},
            },
            return_document=ReturnDocument.AFTER,
        )
        if not updated_doc:
            return None
        return self._doc_to_response(updated_doc)

    async def create_user(self, user_in: UserRegister, hashed_pw: str) -> UserProfileResponse:
        now = datetime.now(timezone.utc)
        uid = f"USR-{secrets.token_hex(4).upper()}"
        doc = {
            "id": uid,
            "name": user_in.name,
            "email": user_in.email.strip().lower(),
            "hashed_password": hashed_pw,
            "role": user_in.role.value if hasattr(user_in.role, "value") else user_in.role,
            "ward": user_in.ward,
            "created_at": now,
        }
        await self.users_col.insert_one(doc)
        return UserProfileResponse(
            id=uid,
            name=user_in.name,
            email=doc["email"],
            role=UserRole(doc["role"]),
            ward=doc["ward"],
            created_at=now,
        )

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        clean_email = email.strip().lower()
        return await self.users_col.find_one({"email": clean_email})

    async def get_user_by_id(self, user_id: str) -> Optional[UserProfileResponse]:
        doc = await self.users_col.find_one({"id": user_id})
        if not doc:
            return None
        return UserProfileResponse(
            id=doc["id"],
            name=doc["name"],
            email=doc["email"],
            role=UserRole(doc["role"]),
            ward=doc["ward"],
            created_at=doc["created_at"],
        )

    async def check_health(self) -> DatabaseHealth:
        """Pings the database to verify active connection."""
        if not self.client:
            return DatabaseHealth(
                status="disconnected",
                engine="mongodb",
                database=self.db_name,
                error="MongoDB client not initialized",
            )
        try:
            # Issue quick ping command with timeout
            await self.client.admin.command("ping")
            return DatabaseHealth(
                status="connected",
                engine="mongodb",
                database=self.db_name,
            )
        except Exception as e:
            # Return descriptive error without logging secrets
            err_msg = str(e)
            return DatabaseHealth(
                status="error",
                engine="mongodb",
                database=self.db_name,
                error=f"Connection failure: {err_msg[:120]}",
            )

    async def close(self) -> None:
        if self.client:
            await self.client.close()
            self.client = None


class UnavailableMongoRepository:
    """
    Active when MONGODB_URI is not set or failed to connect during startup.
    Fails fast with actionable messages rather than silently creating fake memory records.
    """

    def __init__(self, reason: str):
        self.reason = reason

    async def create(self, report_in: ReportCreate) -> ReportResponse:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env to persist reports."
        )

    async def list_all(
        self,
        category: Optional[IssueCategory] = None,
        status: Optional[ReportStatus] = None,
        user_id: Optional[str] = None,
        ward: Optional[str] = None,
    ) -> List[ReportResponse]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def get_by_id(self, report_id: str) -> Optional[ReportResponse]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def update_status(self, report_id: str, new_status: ReportStatus) -> Optional[ReportResponse]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def upvote(self, report_id: str) -> Optional[ReportResponse]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def create_user(self, user_in: UserRegister, hashed_pw: str) -> UserProfileResponse:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def get_user_by_id(self, user_id: str) -> Optional[UserProfileResponse]:
        raise RuntimeError(
            f"MongoDB Atlas is not available: {self.reason}. "
            "Please configure MONGODB_URI in backend/.env."
        )

    async def check_health(self) -> DatabaseHealth:
        return DatabaseHealth(
            status="disconnected",
            engine="mongodb",
            error=self.reason,
        )

    async def close(self) -> None:
        pass


def get_repository() -> IReportRepository:
    """
    Factory function to instantiate the MongoDB repository based on environment configuration.
    """
    mongodb_uri = os.getenv("MONGODB_URI", "").strip()
    db_name = os.getenv("MONGODB_DATABASE", "civiclens").strip() or "civiclens"

    if not mongodb_uri:
        return UnavailableMongoRepository(
            reason="MONGODB_URI environment variable is missing in backend/.env"
        )

    return MongoReportRepository(uri=mongodb_uri, db_name=db_name)
