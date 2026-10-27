# CivicLens AI — Expo + React Native Frontend & FastAPI Backend

CivicLens AI is a mobile-first civic  reporting and analysis application built with **React Native (Expo)**, **TypeScript**, and a **FastAPI** backend service.

---

## Architecture Overview

- **Frontend**: React Native + Expo SDK 58 + TypeScript
  - Centralized API Service: [`src/services/api.ts`](file:///c:/Users/KINGSHUK/CivicLensAI/src/services/api.ts)
  - AI Analysis Service: [`src/services/issueAnalysisService.ts`](file:///c:/Users/KINGSHUK/CivicLensAI/src/services/issueAnalysisService.ts) (Client-side simulation layer)
  - Main App Screen & Navigation: [`App.tsx`](file:///c:/Users/KINGSHUK/CivicLensAI/App.tsx)
- **Backend**: FastAPI (Python 3.10+)
  - In-memory repository with seeded civic issue reports
  - REST endpoints for health, report creation, report listing, details, and status updates

---

## Environment & API Configuration

The mobile frontend communicates with the backend via the `EXPO_PUBLIC_API_URL` environment variable.

### Setting `EXPO_PUBLIC_API_URL`

Create a `.env` file in the project root (or set the variable in your shell):

```bash
# In the project root: .env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

> [!IMPORTANT]
> **Expo Public Variables**: Any variable prefixed with `EXPO_PUBLIC_` is automatically bundled by Expo into the mobile client code. Restart the Expo dev server whenever you modify `.env`.

### Host Addresses for Android Development

| Development Target | Host URL to Use | Explanation |
| :--- | :--- | :--- |
| **Android Emulator** | `http://10.0.2.2:8000` | The Android Emulator runs in a separate virtual network. `127.0.0.1` refers to the emulator device itself, whereas `10.0.2.2` routes directly to the development PC host loopback interface. |
| **Physical Android Phone** | `http://<YOUR_LOCAL_IP>:8000` (e.g., `http://192.168.1.15:8000`) | Both your PC and phone **must be connected to the exact same Wi-Fi / local network**. Use `ipconfig` (Windows) to find your local IPv4 address. |
| **iOS Simulator / Web** | `http://127.0.0.1:8000` | iOS Simulator and Web share the desktop's localhost interface. |

If `EXPO_PUBLIC_API_URL` is omitted, `api.ts` automatically defaults to:
- `http://10.0.2.2:8000` when running on an Android platform
- `http://127.0.0.1:8000` when running on iOS or Web

---

## Quick Start & Running Locally

### 1. Start the FastAPI Backend

Open a terminal and navigate to the backend directory:

```powershell
cd backend

# Create virtual environment (if not already done)
python -m venv .venv
.\.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Launch FastAPI service (bound to 0.0.0.0 to accept emulator and physical phone connections)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify backend health in your browser or curl:
- Health check: `http://localhost:8000/health`
- Interactive API Docs: `http://localhost:8000/docs`

### 2. Start the Expo Mobile App

In a separate terminal at the project root:

```powershell
# Set API URL for Android emulator (or create .env file)
$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:8000"

# Start the Expo development server
npx expo start
```

Press:
- `a` to run on connected Android Emulator / Android Device
- `w` to run in web browser

---

## Step-by-Step Android Testing Flow

### 1. Verify Home Screen Issue Retrieval (`GET /api/reports`)
1. Launch the backend (`uvicorn main:app --host 0.0.0.0 --port 8000`) and the mobile app.
2. Open the **Home** tab.
3. You will observe the community impact counters and the **Nearby Issues** list populated directly from the backend (seeded reports `CL-1001`, `CL-1002`, `CL-1003`).
4. Pull down the screen to trigger **Pull-to-Refresh** (`onRefresh`), or tap the `🔄` button in the top bar.

### 2. Test Report Details & Status Update (`GET /api/reports/{id}` & `PATCH /api/reports/{id}/status`)
1. On the Home screen, tap on any issue card (e.g., `CL-1001`).
2. A bottom sheet modal opens, retrieving full details from `GET /api/reports/CL-1001`.
3. In the **Update Report Status** section, tap **"Under Review"** or **"Resolved"**.
4. The app sends `PATCH /api/reports/CL-1001/status` to the backend, updates the badge immediately, and synchronizes the card on the Home screen.

### 3. Test Submitting a New Report (`POST /api/reports`)
1. On the Home screen, tap **"Report an Issue"**.
2. Select a category (e.g., `Waterlogging` 🌊).
3. (Optional) Attach a photo from your gallery.
4. Enter an Issue Title (e.g., `Severe sidewalk flooding`).
5. Enter a Description (e.g., `Overflown drain blocking pedestrian crosswalk near the junction`).
6. Enter Location (e.g., `5th Cross & Elm St`).
7. (Optional) Tap **"Analyze with AI"** to run the mock analysis. The category or priority recommendation can be reviewed.
8. Tap **"Submit Report"**.
9. The button shows a spinner with `"Submitting to Backend..."` while dispatching `POST /api/reports`.
10. Once the backend responds with HTTP 201 Created and the new report reference ID (e.g., `CL-1004`), the app shows the confirmation screen.
11. Tap **"View on Home Screen"** — your newly created report appears at the top of the list!

### 4. Test Error & Offline States
1. Stop the FastAPI backend (`Ctrl + C` in the backend terminal).
2. On the mobile app, pull down to refresh on the Home screen.
3. The app displays a clear connection banner:
   > *"Cannot reach CivicLens backend at http://10.0.2.2:8000. Ensure FastAPI is running..."*
4. Attempting to submit a new report will display an alert and inline error banner without falsely reporting success.
5. Restart the backend and tap **"Retry Connection"** — the app immediately reconnects.

---

## Backend Endpoints

| Method | Endpoint | Action | Connected in App |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service health status | Centralized in `apiClient.checkHealth()` |
| `GET` | `/api/reports` | List civic reports | Connected to Home screen issue feed & impact stats |
| `POST` | `/api/reports` | Create new report | Connected to "Report an Issue" form submission |
| `GET` | `/api/reports/{report_id}` | Retrieve report by ID | Connected to Report Details modal |
| `PATCH` | `/api/reports/{report_id}/status` | Update workflow status | Connected to status action buttons in Details modal |

---

## Verification & Type Safety

Run project verification commands:

```powershell
npx tsc --noEmit           # TypeScript compiler check
python backend/test_api.py # Backend endpoint test suite
```
