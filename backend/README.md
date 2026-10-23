# CivicLens AI — FastAPI Backend with MongoDB Atlas

FastAPI backend service for civic issue reporting and analysis for the CivicLens AI platform, with persistent **MongoDB Atlas** document storage.

---

## Project Structure

```
backend/
├── .env.example       # Example environment configuration (MongoDB URI, CORS, port, debug)
├── main.py            # FastAPI entry point, CORS middleware, lifespan hooks, and API routes
├── models.py          # Pydantic validation schemas, HealthResponse, and enums
├── repository.py      # MongoReportRepository with atomic CL-xxxx ID generation and PyMongo async API
├── requirements.txt   # Backend Python dependencies (FastAPI, PyMongo, dnspython, Pydantic)
├── test_api.py        # Automated endpoint test suite
└── README.md          # Setup and testing documentation
```

---

## MongoDB Atlas Configuration

1. Create a `backend/.env` file (copied from `backend/.env.example`):
   ```powershell
   Copy-Item .env.example .env
   ```

2. Open `backend/.env` and configure your MongoDB Atlas connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DATABASE=civiclens
   SEED_SAMPLE_DATA=false
   ```

> [!IMPORTANT]
> - Never commit `backend/.env` to Git (it is ignored in `.gitignore`).
> - In MongoDB Atlas Network Access, ensure your current IP address (or `0.0.0.0/0` during development) is whitelisted.
> - If `SEED_SAMPLE_DATA=true`, the backend will seed `CL-1001`, `CL-1002`, and `CL-1003` into your database once if the collection is empty.

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status and MongoDB connectivity check (`status: healthy/degraded`) |
| `POST` | `/api/reports` | Create and store a new civic issue report in MongoDB Atlas with atomic ID `CL-xxxx` |
| `GET` | `/api/reports` | List all reports from MongoDB (supports `?category=` and `?status=` query filters) |
| `GET` | `/api/reports/{report_id}` | Retrieve report by ID (e.g., `CL-1001`) |
| `PATCH` | `/api/reports/{report_id}/status` | Update report status (`Reported`, `Under Review`, `Resolved`) in MongoDB |
| `GET` | `/docs` | Interactive Swagger UI API documentation |
| `GET` | `/redoc` | ReDoc API documentation |

---

## Installation & Running Locally

In PowerShell:
```powershell
cd c:\Users\KINGSHUK\CivicLensAI\backend

# 1. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the FastAPI server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## How to Verify Persistence After Restarting the Backend

1. **Verify Health**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8000/health"
   ```
   Confirm `database.status` is `"connected"`.

2. **Submit a New Report**:
   ```powershell
   $body = @{
       title = "Main Street Water Pipe Leak"
       description = "Substantial water leaking across the road pavement"
       category = "Water Supply"
       location = "Main St & 4th Avenue"
       suggested_priority = "High"
   } | ConvertTo-Json

   $newReport = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/reports" -Method Post -Body $body -ContentType "application/json"
   Write-Host "Created report ID: $($newReport.id)"
   ```

3. **Restart FastAPI**:
   In the terminal running `uvicorn`, press `Ctrl + C` to stop the server, and restart it:
   ```powershell
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Verify Report Still Exists in MongoDB**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/reports/$($newReport.id)"
   ```
   The report will be returned intact from MongoDB Atlas, proving persistence across server restarts.
