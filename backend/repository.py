import os
import re
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
)

# Initial sample records for explicit / dev seeding
INITIAL_SAMPLE_REPORTS = [
    {
        "id": "CL-1001",
        "title": "Pothole on Main Road",
        "description": "Deep road crater causing heavy vehicular slowdowns near the junction.",
        "category": IssueCategory.ROAD_DAMAGE,
        "location": "Main Road",
        "suggested_priority": SuggestedPriority.HIGH,
        "status": ReportStatus.REPORTED,
    },
    {
        "id": "CL-1002",
        "title": "Garbage Overflow",
        "description": "Community bins spilling onto the pavement, needs scheduled pickup.",
        "category": IssueCategory.GARBAGE,
        "location": "Market Street",
        "suggested_priority": SuggestedPriority.MEDIUM,
        "status": ReportStatus.UNDER_REVIEW,
    },
    {
        "id": "CL-1003",
        "title": "Broken Streetlight",
        "description": "Post pole flickering at night, creating dark spots near the park lane.",
        "category": IssueCategory.BROKEN_STREETLIGHT,
        "location": "Park Avenue",
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
    ) -> List[ReportResponse]:
        ...

    async def get_by_id(self, report_id: str) -> Optional[ReportResponse]:
        ...

    async def update_status(self, report_id: str, new_status: ReportStatus) -> Optional[ReportResponse]:
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
    - Correctly handles ObjectId sanitization.
    - Supports idempotent dev seeding without creating duplicate reports on server reload.
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

    async def initialize(self):
        """Initializes collections and indexes once connection is verified."""
        # Ensure index on custom report id (unique) and creation time for performant sorting
        await self.reports_col.create_index([("id", pymongo.ASCENDING)], unique=True)
        await self.reports_col.create_index([("created_at", pymongo.DESCENDING)])

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
        """
        Seeds initial sample reports (CL-1001, CL-1002, CL-1003) if database has no reports.
        Idempotent: Does not duplicate documents if already present.
        """
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
                "suggested_priority": (
                    sample["suggested_priority"].value
                    if hasattr(sample["suggested_priority"], "value")
                    else sample["suggested_priority"]
                ),
                "status": sample["status"].value if hasattr(sample["status"], "value") else sample["status"],
                "image_url": None,
                "created_at": now,
                "updated_at": now,
                "is_mock_persistence": False,
            }
            # Use upsert to be safe against race conditions
            await self.reports_col.update_one(
                {"id": sample["id"]},
                {"$setOnInsert": doc},
                upsert=True,
            )
            inserted_count += 1

        return inserted_count

    async def _get_next_sequence_value(self) -> str:
        """
        Atomically increments and returns the next sequential report ID (e.g. 'CL-1004').
        Safe under concurrent requests.
        """
        result = await self.counters_col.find_one_and_update(
            {"_id": "report_id"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        seq_num = result.get("seq", 1004)
        return f"CL-{seq_num}"

    def _doc_to_response(self, doc: dict) -> ReportResponse:
        """Converts raw MongoDB document into validated ReportResponse."""
        doc.pop("_id", None)  # Remove internal ObjectId from payload
        return ReportResponse(
            id=doc["id"],
            title=doc["title"],
            description=doc["description"],
            category=IssueCategory(doc["category"]),
            location=doc["location"],
            suggested_priority=SuggestedPriority(doc["suggested_priority"]),
            status=ReportStatus(doc["status"]),
            image_url=doc.get("image_url"),
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
            "suggested_priority": (
                (report_in.suggested_priority or SuggestedPriority.MEDIUM).value
                if hasattr(report_in.suggested_priority or SuggestedPriority.MEDIUM, "value")
                else (report_in.suggested_priority or SuggestedPriority.MEDIUM)
            ),
            "status": ReportStatus.REPORTED.value,
            "image_url": report_in.image_url,
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
    ) -> List[ReportResponse]:
        query = {}
        if category:
            query["category"] = category.value if hasattr(category, "value") else category
        if status:
            query["status"] = status.value if hasattr(status, "value") else status

        cursor = self.reports_col.find(query).sort("created_at", pymongo.DESCENDING)
        reports: List[ReportResponse] = []
        async for doc in cursor:
            reports.append(self._doc_to_response(doc))
        return reports

    async def get_by_id(self, report_id: str) -> Optional[ReportResponse]:
        # Case-insensitive match on report identifier (e.g. 'cl-1001' or 'CL-1001')
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
