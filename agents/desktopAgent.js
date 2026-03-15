/**
 * Desktop Agent - Manages real X11 desktop with optional VNC
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');

class DesktopAgent {
  constructor() {
    this.display = null;
    this.windowManagerProcess = null;
    this.started = false;
  }

  /**
   * Start virtual X11 desktop
   */
  async start() {
    if (this.started) return { success: true, display: this.display };

    console.log('[DesktopAgent] Starting X11 desktop...');

    try {
      // Check if DISPLAY is already set (running in X11 environment)
      if (process.env.DISPLAY && process.env.DISPLAY.match(/^:\d+/)) {
        this.display = process.env.DISPLAY;
        this.started = true;
        console.log(`[DesktopAgent] Using existing X11 display: ${this.display}`);
        
        // Start window manager anyway
        this.windowManagerProcess = spawn('fluxbox', [], {
          env: { ...process.env, DISPLAY: this.display },
          detached: true,
          stdio: 'ignore'
        });
        this.windowManagerProcess.unref();
        return { success: true, display: this.display };
      }

      // Find an available display number
      let displayNum = 0;
      while (displayNum < 100) {
        const sock = `/tmp/.X11-unix/${displayNum}`;
        if (!fs.existsSync(sock)) {
          this.display = `:${displayNum}`;
          break;
        }
        displayNum++;
      }

      if (!this.display) {
        return { success: false, error: 'Could not find available display' };
      }

      console.log(`[DesktopAgent] Starting X11 framebuffer on ${this.display}...`);
      
      // Xvfb is the minimal X11 server
      this.xvfbProcess = spawn('Xvfb', [this.display, '-screen', '0', '1920x1080x24', '-ac'], {
        detached: true,
        stdio: 'ignore'
      });
      this.xvfbProcess.unref();

      // Wait for X11 to start
      await new Promise(r => setTimeout(r, 1000));

      // Start fluxbox window manager
      console.log(`[DesktopAgent] Starting fluxbox on ${this.display}...`);
      this.windowManagerProcess = spawn('fluxbox', [], {
        env: { ...process.env, DISPLAY: this.display },
        detached: true,
        stdio: 'ignore'
      });
      this.windowManagerProcess.unref();

      await new Promise(r => setTimeout(r, 800));
      this.started = true;
      console.log(`[DesktopAgent] X11 desktop ready - DISPLAY=${this.display}`);
      return { success: true, display: this.display };
    } catch (err) {
      console.error('[DesktopAgent] Failed to start desktop:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Capture desktop screen using ffmpeg from X11
   */
  async captureScreen() {
    if (!this.started || !this.display) return null;

    try {
      const tmpFile = `/tmp/x11_screen_${Date.now()}.jpg`;
      const cmd = `DISPLAY=${this.display} ffmpeg -f x11grab -video_size 1920x1080 -framerate 1 -i ${this.display}.0 -frames:v 1 -q:v 2 "${tmpFile}" -y 2>/dev/null`;
      
      execSync(cmd, { timeout: 2500 });

      if (fs.existsSync(tmpFile)) {
        const data = fs.readFileSync(tmpFile);
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        return data;
      }
    } catch (err) {
      // Silent fail - fallback to Playwright
    }

    return null;
  }

  /**
   * Get display
   */
  getDisplay() {
    return this.display;
  }

  /**
   * Stop desktop
   */
  async stop() {
    if (this.xvfbProcess) {
      try { this.xvfbProcess.kill(); } catch (e) {}
    }
    this.started = false;
  }
}

module.exports = DesktopAgent;
