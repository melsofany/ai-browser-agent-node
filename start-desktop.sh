#!/bin/bash
# Start virtual desktop with Xvfb + fluxbox window manager

DISPLAY=:99
SCREENSIZE="1920x1080x24"

echo "[Desktop] Starting Xvfb on $DISPLAY with resolution $SCREENSIZE..."
Xvfb $DISPLAY -screen 0 $SCREENSIZE -ac &
XVFB_PID=$!
sleep 2

echo "[Desktop] Starting fluxbox window manager..."
DISPLAY=$DISPLAY fluxbox &
FLUXBOX_PID=$!
sleep 1

echo "[Desktop] Desktop ready on DISPLAY=$DISPLAY"
echo "XVFB_PID=$XVFB_PID"
echo "FLUXBOX_PID=$FLUXBOX_PID"

# Keep script running
wait
