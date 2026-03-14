/**
 * Stealth Mode
 * Implements human-like behavior to avoid bot detection
 * Includes randomized delays, human-like mouse movements, and browser fingerprinting
 */

class StealthMode {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.humanLikeDelays = options.humanLikeDelays !== false;
    this.randomizeUserAgent = options.randomizeUserAgent !== false;
    this.maskWebDriver = options.maskWebDriver !== false;
    this.randomizeViewport = options.randomizeViewport !== false;
    
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
    ];

    this.viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 2560, height: 1440 }
    ];

    this.interactionStats = {
      totalClicks: 0,
      totalTyping: 0,
      totalScrolls: 0,
      averageClickDelay: 0,
      averageTypingSpeed: 0
    };
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Get random viewport
   */
  getRandomViewport() {
    return this.viewports[Math.floor(Math.random() * this.viewports.length)];
  }

  /**
   * Generate human-like delay
   */
  getHumanLikeDelay(min = 300, max = 2000) {
    if (!this.humanLikeDelays) return 0;

    // Use Gaussian distribution for more natural delays
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const mean = (min + max) / 2;
    const std = (max - min) / 6;
    
    return Math.max(min, Math.min(max, mean + z * std));
  }

  /**
   * Get typing speed (characters per second)
   */
  getTypingSpeed() {
    // Human typing speed: 40-60 WPM = 200-300 CPM
    // With randomization: 150-400 CPM
    return 150 + Math.random() * 250;
  }

  /**
   * Get mouse movement curve (Bezier curve for natural movement)
   */
  getMouseMovementPath(startX, startY, endX, endY, steps = 10) {
    const path = [];
    
    // Control points for Bezier curve
    const cp1X = startX + (endX - startX) * 0.25 + (Math.random() - 0.5) * 100;
    const cp1Y = startY + (endY - startY) * 0.25 + (Math.random() - 0.5) * 100;
    const cp2X = startX + (endX - startX) * 0.75 + (Math.random() - 0.5) * 100;
    const cp2Y = startY + (endY - startY) * 0.75 + (Math.random() - 0.5) * 100;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      const x = mt3 * startX + 3 * mt2 * t * cp1X + 3 * mt * t2 * cp2X + t3 * endX;
      const y = mt3 * startY + 3 * mt2 * t * cp1Y + 3 * mt * t2 * cp2Y + t3 * endY;

      path.push({ x: Math.round(x), y: Math.round(y) });
    }

    return path;
  }

  /**
   * Apply stealth to browser context
   */
  async applyStealthToBrowser(context) {
    console.log('[StealthMode] Applying stealth measures to browser context');

    try {
      // Mask webdriver property
      if (this.maskWebDriver) {
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
          });
          
          // Mask chrome property
          window.chrome = {
            runtime: {}
          };

          // Mask plugins
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });

          // Mask languages
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
          });

          // Mask permissions
          const originalQuery = window.navigator.permissions.query;
          window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
              Promise.resolve({ state: Notification.permission }) :
              originalQuery(parameters)
          );
        });
      }

      return { success: true };
    } catch (error) {
      console.error('[StealthMode] Failed to apply stealth:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Human-like click with movement
   */
  async humanLikeClick(page, x, y) {
    console.log(`[StealthMode] Human-like click at (${x}, ${y})`);

    try {
      // Get current mouse position (assume center of screen)
      const currentX = 640;
      const currentY = 360;

      // Generate natural mouse movement path
      const path = this.getMouseMovementPath(currentX, currentY, x, y);

      // Move mouse along path
      for (const point of path) {
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(10 + Math.random() * 20);
      }

      // Random delay before click
      await page.waitForTimeout(this.getHumanLikeDelay(100, 500));

      // Click
      await page.mouse.click(x, y);

      // Random delay after click
      await page.waitForTimeout(this.getHumanLikeDelay(300, 1500));

      this.interactionStats.totalClicks++;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Human-like typing
   */
  async humanLikeType(page, text) {
    console.log(`[StealthMode] Human-like typing: ${text.substring(0, 50)}...`);

    try {
      const typingSpeed = this.getTypingSpeed();
      const delayBetweenChars = 1000 / typingSpeed * 1000; // Convert to milliseconds

      for (const char of text) {
        await page.keyboard.type(char);
        
        // Add random delay between characters
        const delay = delayBetweenChars * (0.8 + Math.random() * 0.4);
        await page.waitForTimeout(delay);

        // Occasionally make a "mistake" and correct it
        if (Math.random() < 0.02) {
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(100 + Math.random() * 200);
          await page.keyboard.type(char);
        }
      }

      this.interactionStats.totalTyping++;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Human-like scrolling
   */
  async humanLikeScroll(page, direction = 'down', amount = 3) {
    console.log(`[StealthMode] Human-like scroll ${direction} by ${amount}`);

    try {
      const scrollAmount = direction === 'down' ? amount * 100 : -amount * 100;

      // Scroll in steps for natural behavior
      const steps = 3 + Math.floor(Math.random() * 3);
      const stepSize = scrollAmount / steps;

      for (let i = 0; i < steps; i++) {
        await page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, stepSize);

        // Random delay between scroll steps
        await page.waitForTimeout(this.getHumanLikeDelay(100, 300));
      }

      this.interactionStats.totalScrolls++;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Random user behavior (idle time, mouse movement)
   */
  async simulateRandomBehavior(page) {
    console.log('[StealthMode] Simulating random user behavior');

    try {
      // Random idle time
      const idleTime = 1000 + Math.random() * 3000;
      await page.waitForTimeout(idleTime);

      // Random mouse movement
      const randomX = Math.floor(Math.random() * 1280);
      const randomY = Math.floor(Math.random() * 720);
      await page.mouse.move(randomX, randomY);

      // Random scroll
      if (Math.random() < 0.3) {
        const scrollDir = Math.random() < 0.5 ? 'down' : 'up';
        await this.humanLikeScroll(page, scrollDir, 1);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Add realistic headers
   */
  getRealisticHeaders() {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': this.getRandomUserAgent(),
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    };
  }

  /**
   * Get interaction statistics
   */
  getInteractionStats() {
    return {
      ...this.interactionStats,
      averageClickDelay: this.interactionStats.totalClicks > 0 ? 
        this.getHumanLikeDelay(300, 2000) : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.interactionStats = {
      totalClicks: 0,
      totalTyping: 0,
      totalScrolls: 0,
      averageClickDelay: 0,
      averageTypingSpeed: 0
    };
  }

  /**
   * Get stealth configuration
   */
  getConfiguration() {
    return {
      enabled: this.enabled,
      humanLikeDelays: this.humanLikeDelays,
      randomizeUserAgent: this.randomizeUserAgent,
      maskWebDriver: this.maskWebDriver,
      randomizeViewport: this.randomizeViewport,
      currentUserAgent: this.getRandomUserAgent(),
      currentViewport: this.getRandomViewport()
    };
  }
}

module.exports = StealthMode;
