#!/bin/bash
# Quick start script for testing the storyboard replication feature

echo "======================================================================"
echo "Storyboard Replication - Quick Start"
echo "======================================================================"

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  Backend server is not running"
    echo ""
    echo "Start the backend with:"
    echo "  cd /Users/shane/projects/tiktok-analyzer/backend"
    echo "  uvicorn main:app --reload --port 8000"
    echo ""
    exit 1
fi

echo "✓ Backend server is running"
echo ""

# Get first video from database
VIDEO_ID=$(cd /Users/shane/projects/tiktok-analyzer/backend && python -c "
from app.database import SessionLocal
from app.models.video import Video
db = SessionLocal()
video = db.query(Video).first()
if video:
    print(video.id)
db.close()
" 2>/dev/null)

if [ -z "$VIDEO_ID" ]; then
    echo "✗ No videos found in database"
    echo "  Please upload a video first"
    exit 1
fi

echo "✓ Found video: $VIDEO_ID"
echo ""

# Create storyboard task
echo "Creating storyboard replication task..."
RESPONSE=$(curl -s -X POST "http://localhost:8000/api/storyboard/create?video_id=$VIDEO_ID")
TASK_ID=$(echo $RESPONSE | python -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
    echo "✗ Failed to create task"
    echo "$RESPONSE"
    exit 1
fi

echo "✓ Task created: $TASK_ID"
echo ""

# Wait for processing
echo "Waiting for processing to complete..."
for i in {1..30}; do
    sleep 1
    STATUS=$(curl -s "http://localhost:8000/api/storyboard/$TASK_ID" | python -c "import sys, json; print(json.load(sys.stdin)['status'])" 2>/dev/null)

    if [ "$STATUS" = "ready" ]; then
        echo "✓ Processing completed!"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo "✗ Processing failed"
        curl -s "http://localhost:8000/api/storyboard/$TASK_ID" | python -m json.tool
        exit 1
    fi

    echo "  Status: $STATUS (${i}s)"
done

echo ""

# Get task details
echo "Task Details:"
echo "----------------------------------------------------------------------"
curl -s "http://localhost:8000/api/storyboard/$TASK_ID" | python -m json.tool

echo ""
echo "======================================================================"
echo "✓ Test completed successfully!"
echo ""
echo "View the storyboard image:"
echo "  curl http://localhost:8000/api/storyboard/$TASK_ID/image -o storyboard.jpg"
echo "  open storyboard.jpg"
echo "======================================================================"
