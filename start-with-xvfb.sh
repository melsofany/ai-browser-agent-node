#!/bin/bash
# Wrapper script to run the app with xvfb-run

exec xvfb-run -a -s "-screen 0 1920x1080x24" npm run dev
