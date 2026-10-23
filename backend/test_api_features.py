import urllib.request
import json

url = "http://127.0.0.1:8000/api/reports"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print(f"Total reports from backend: {len(data)}")
    for r in data[:3]:
        print(f"Report: {r['id']} | Status: {r['status']} | Ward: {r.get('ward')} | Upvotes: {r.get('upvotes', 0)}")

# Test upvoting the first report
first_id = data[0]['id']
upvote_req = urllib.request.Request(f"http://127.0.0.1:8000/api/reports/{first_id}/upvote", method='PATCH')
with urllib.request.urlopen(upvote_req) as resp:
    upvoted = json.loads(resp.read().decode())
    print(f"Successfully upvoted {first_id}! New upvote count: {upvoted.get('upvotes')}")
