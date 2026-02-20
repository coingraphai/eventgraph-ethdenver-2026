#!/bin/bash
# Installs the pipeline scheduler as a Mac launchd service.
# Survives terminal close, Mac sleep, and reboots.
# Usage: bash setup-pipeline-service.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.eventgraph.pipeline.plist"
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
PIPELINE_DIR="$ROOT_DIR/data-pipeline"
LOG="$ROOT_DIR/logs/pipeline.log"

# Stop existing if running
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.eventgraph.pipeline</string>

    <key>ProgramArguments</key>
    <array>
        <string>$VENV_PYTHON</string>
        <string>-m</string>
        <string>predictions_ingest.cli</string>
        <string>schedule</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PIPELINE_DIR</string>

    <key>StandardOutPath</key>
    <string>$LOG</string>

    <key>StandardErrorPath</key>
    <string>$LOG</string>

    <!-- Restart automatically if it crashes -->
    <key>KeepAlive</key>
    <true/>

    <!-- Start immediately on load -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Restart delay if it crashes -->
    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>
EOF

# Load the service
launchctl load "$PLIST"
echo "✅ Pipeline service installed and started"
echo "   Logs:  tail -f $LOG"
echo "   Stop:  launchctl unload $PLIST"
echo "   Start: launchctl load $PLIST"
echo "   Status: launchctl list | grep eventgraph"
