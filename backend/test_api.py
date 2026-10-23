"""
Self-contained endpoint verification script for CivicLens AI FastAPI backend with MongoDB Atlas support.
Validates:
1. Health endpoint reporting when MongoDB is not configured or offline.
2. 503 error handling when database is unavailable.
3. Live endpoints when MONGODB_URI is provided.
"""
import asyncio
import os
from models import (
    ReportCreate,
    ReportStatusUpdate,
    IssueCategory,
    ReportStatus,
    SuggestedPriority,
)
import main
from fastapi import HTTPException


async def test_endpoints_without_mongo():
    print("--- TEST SUITE: NO MONGODB_URI CONFIGURED (Actionable Error Check) ---")
    
    # 1. Test GET /health
    print("1. Testing GET /health...")
    health = await main.get_health()
    print("   Health response:", health.model_dump())
    assert health.status == "degraded"
    assert health.database is not None
    assert health.database.status == "disconnected"
    assert "MONGODB_URI" in (health.database.error or "")
    print("   PASSED: GET /health correctly reports database disconnected.")

    # 2. Test POST /api/reports without MongoDB (Must return 503 Service Unavailable, not fake in-memory)
    print("\n2. Testing POST /api/reports without MongoDB...")
    new_in = ReportCreate(
        title="Large Water Puddle Near Metro Station",
        description="Rain water accumulation blocking the sidewalk ramp and pedestrian passage.",
        category=IssueCategory.WATERLOGGING,
        location="Metro Gate 2, Station Road",
        suggested_priority=SuggestedPriority.HIGH,
    )
    try:
        await main.create_report(new_in)
        assert False, "Should have raised 503 HTTPException"
    except HTTPException as e:
        assert e.status_code == 503
        print(f"   PASSED: Expected 503 raised: {e.detail}")

    # 3. Test GET /api/reports without MongoDB
    print("\n3. Testing GET /api/reports without MongoDB...")
    try:
        await main.list_reports(category=None, status=None)
        assert False, "Should have raised 503 HTTPException"
    except HTTPException as e:
        assert e.status_code == 503
        print(f"   PASSED: Expected 503 raised: {e.detail}")

    print("\nALL OFFLINE / UNCONFIGURED MONGODB CHECKS PASSED SUCCESSFULLY!\n")


async def test_endpoints_with_mongo():
    print("--- TEST SUITE: LIVE MONGODB CONFIGURED ---")
    health = await main.get_health()
    print("   Live Health response:", health.model_dump())
    if health.status != "healthy":
        print("   Skipping live MongoDB write tests because MONGODB_URI is not connected.")
        return

    # Create report
    new_in = ReportCreate(
        title="Live Test Streetlight Failure",
        description="Streetlight pole flickering in test block alley.",
        category=IssueCategory.BROKEN_STREETLIGHT,
        location="Test Alley 12",
        suggested_priority=SuggestedPriority.MEDIUM,
    )
    created = await main.create_report(new_in)
    print(f"   Created live report: {created.id} (Persistent: {not created.is_mock_persistence})")
    assert created.id.startswith("CL-")

    fetched = await main.get_report(created.id)
    assert fetched.id == created.id
    print(f"   Retrieved live report: {fetched.id}")

    updated = await main.update_report_status(created.id, ReportStatusUpdate(status=ReportStatus.UNDER_REVIEW))
    assert updated.status == ReportStatus.UNDER_REVIEW
    print(f"   Updated status to: {updated.status}")


if __name__ == "__main__":
    asyncio.run(test_endpoints_without_mongo())
    if os.getenv("MONGODB_URI"):
        asyncio.run(test_endpoints_with_mongo())
