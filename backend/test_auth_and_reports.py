"""
Test suite validating:
1. Registration with password hashing
2. Token generation
3. Duplicate user conflict prevention
4. Invalid credentials check
5. Protected route /api/auth/me
6. Creating reports with lat/lng
7. Protected user reports /api/reports/my
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

import main
from models import (
    UserRegister,
    UserLogin,
    ReportCreate,
    IssueCategory,
    SuggestedPriority,
)
from auth import decode_access_token


async def run_auth_and_report_tests():
    print("=== CIVICLENS AI AUTH & REPORT VERIFICATION ===")

    # Initialize repository
    await main.repository.initialize()

    # 1. Test Registration
    test_email = f"test.resident.{os.urandom(3).hex()}@civiclens.org"
    print(f"1. Registering new user: {test_email}...")
    reg_data = UserRegister(
        name="Ananya Sen",
        email=test_email,
        password="SecurePass#2026",
        role="Citizen",
        ward="Downtown Ward 14",
    )
    reg_response = await main.register(reg_data)
    assert reg_response.access_token is not None
    assert reg_response.user.email == test_email.lower()
    print(f"   PASSED: User registered with ID {reg_response.user.id}")

    # 2. Test Duplicate Registration Conflict
    print("2. Testing duplicate email prevention (HTTP 409)...")
    try:
        await main.register(reg_data)
        assert False, "Should fail on duplicate email"
    except main.HTTPException as e:
        assert e.status_code == 409
        print("   PASSED: 409 Conflict raised on duplicate email.")

    # 3. Test Login with Valid Credentials
    print("3. Testing login with valid credentials...")
    login_data = UserLogin(email=test_email, password="SecurePass#2026")
    login_response = await main.login(login_data)
    assert login_response.access_token is not None
    print(f"   PASSED: Logged in, JWT token issued (expires in {login_response.expires_in}s)")

    # 4. Test Login with Bad Password
    print("4. Testing login with invalid password (HTTP 401)...")
    try:
        await main.login(UserLogin(email=test_email, password="WrongPassword!"))
        assert False, "Should fail on bad password"
    except main.HTTPException as e:
        assert e.status_code == 401
        print("   PASSED: 401 Unauthorized raised on invalid password.")

    # 5. Test Token Decoding & /api/auth/me
    print("5. Testing token decoding & protected /api/auth/me...")
    payload = decode_access_token(login_response.access_token)
    assert payload["sub"] == reg_response.user.id
    me = await main.get_me(payload)
    assert me.id == reg_response.user.id
    assert me.email == test_email.lower()
    print(f"   PASSED: /api/auth/me returned {me.name} ({me.role})")

    # 6. Test Creating Report with Real Coordinates
    print("6. Creating report with verified coordinates (Lat 28.6142, Lng 77.2089)...")
    report_in = ReportCreate(
        title="Deep Pothole at Central Circle",
        description="Hazardous crater near the round-about causing vehicle tyre damages.",
        category=IssueCategory.ROAD_DAMAGE,
        location="Central Circle, Ward 14",
        latitude=28.6142,
        longitude=77.2089,
        suggested_priority=SuggestedPriority.HIGH,
    )
    created_report = await main.create_report(report_in, user_payload=payload)
    assert created_report.id.startswith("CL-")
    assert created_report.latitude == 28.6142
    assert created_report.longitude == 77.2089
    assert created_report.user_id == reg_response.user.id
    print(f"   PASSED: Created report {created_report.id} with coords ({created_report.latitude}, {created_report.longitude})")

    # 7. Test /api/reports/my (Personal Protected Reports)
    print("7. Testing personal reports list /api/reports/my...")
    my_reports = await main.list_my_reports(user_payload=payload)
    assert len(my_reports) >= 1
    assert any(r.id == created_report.id for r in my_reports)
    print(f"   PASSED: Retrieved {len(my_reports)} personal report(s) for user {me.id}")

    print("\nALL BACKEND AUTH & COORDINATE TESTS PASSED CLEANLY!\n")


if __name__ == "__main__":
    asyncio.run(run_auth_and_report_tests())
