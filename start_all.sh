#!/bin/bash
# start_all.sh - Launcher for GIS Frontend and Backend

# Clear screen
clear

echo "========================================================="
echo "   Starting GIS Asset Management (Frontend & Backend)    "
echo "========================================================="

# Get absolute path of this script's directory (User_fronted_GIS)
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$FRONTEND_DIR/../backend_GIS" && pwd)"

# Function to stop background processes on exit
cleanup() {
  echo ""
  echo "Stopping services..."
  kill $ASSET_PID $NOTIFY_PID $KPI_PID $GATEWAY_PID $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start backend services
cd "$BACKEND_DIR"

echo "🚀 Starting Asset Microservice on port 8001..."
./.venv/bin/uvicorn services.asset.main:app --host 127.0.0.1 --port 8001 > asset.log 2>&1 &
ASSET_PID=$!

echo "🚀 Starting Notification Microservice on port 8002..."
./.venv/bin/uvicorn services.notification.main:app --host 127.0.0.1 --port 8002 > notification.log 2>&1 &
NOTIFY_PID=$!

echo "🚀 Starting KPI Microservice on port 8003..."
./.venv/bin/uvicorn services.kpi.main:app --host 127.0.0.1 --port 8003 > kpi.log 2>&1 &
KPI_PID=$!

echo "🚀 Starting API Gateway on port 8000..."
./.venv/bin/uvicorn services.gateway.main:app --host 0.0.0.0 --port 8000 > gateway.log 2>&1 &
GATEWAY_PID=$!

# Wait for backend gateway to be ready
echo "⏳ Waiting for API Gateway to start..."
until curl --output /dev/null --silent --fail http://127.0.0.1:8000/health; do
    printf '.'
    sleep 0.5
done
echo " Done!"

# Start frontend
echo "🚀 Starting React Frontend on port 3001..."
cd "$FRONTEND_DIR"
PORT=3001 npm start &
FRONTEND_PID=$!

echo "========================================================="
echo "   GIS application is running!"
echo "   - Frontend: http://localhost:3001"
echo "   - Gateway:  http://localhost:8000 (routes to microservices)"
echo "   Press Ctrl+C to stop all services."
echo "========================================================="

# Keep script running to monitor processes
wait
