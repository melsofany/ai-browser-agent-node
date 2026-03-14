/**
 * Browser Agent
 * Controls the browser using Playwright
 * Handles navigation, clicking, typing, form submission, and content extraction
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { execSync } = require('child_process');

// Use stealth plugin to avoid detection
chromium.use(stealth);

// Attempt to find a system Chromium binary (used as fallback on NixOS/Replit)
function findSystemChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_EXECUTABLE,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  // Try to locate via `which chromium`
  try {
    const which = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (which) candidates.unshift(which);
  } catch (_) {}

  const fs = require('fs');
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

class BrowserAgent {
  constructor(options = {}) {
    this.browser = null;
    this.pages = new Map();
    this.browserTimeout = options.timeout || 30000;
    this.headless = options.headless !== false;
  }

  /**
   * Initialize the browser
   */
  async initialize(io = null) {
    console.log('[BrowserAgent] Initializing browser...');
    this.io = io;

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-gpu',
    ];

    // First attempt: use default Playwright bundled browser
    try {
      this.browser = await chromium.launch({
        headless: this.headless,
        args: launchArgs,
      });
      console.log('[BrowserAgent] Browser initialized successfully (Playwright bundled)');
      return { success: true };
    } catch (error) {
      console.warn('[BrowserAgent] Bundled browser failed, trying system Chromium fallback...', error.message);
    }

    // Second attempt: use system Chromium (for NixOS/Replit environment)
    const systemChromium = findSystemChromium();
    if (systemChromium) {
      try {
        const { chromium: playwrightChromium } = require('playwright');
        this.browser = await playwrightChromium.launch({
          executablePath: systemChromium,
          headless: this.headless,
          args: launchArgs,
        });
        console.log(`[BrowserAgent] Browser initialized successfully (system: ${systemChromium})`);
        return { success: true };
      } catch (error2) {
        console.error('[BrowserAgent] System Chromium also failed:', error2.message);
        return { success: false, error: error2.message };
      }
    }

    return { success: false, error: 'No working Chromium binary found. Try setting PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.' };
  }

  /**
   * Switch to a specific page
   */
  async switchPage(pageId) {
    console.log(`[BrowserAgent] Switching to page: ${pageId}`);
    const pageData = this.pages.get(pageId);
    if (!pageData) {
      return { success: false, error: 'Page not found' };
    }

    // Stop streaming from all other pages
    for (const [id] of this.pages) {
      if (id !== pageId) {
        this.stopStreaming(id);
      }
    }

    // Start streaming for the target page
    this.startStreaming(pageId);
    
    return { success: true, pageId };
  }

  /**
   * Get current page ID
   */
  getCurrentPageId() {
    for (const [id, data] of this.pages) {
      if (data.streamingInterval) return id;
    }
    return 'default';
  }

  /**
   * Start streaming screenshots for a page
   */
  async startStreaming(pageId = 'default') {
    const pageData = this.pages.get(pageId);
    if (!pageData || !this.io) return;

    const { page } = pageData;
    
    if (pageData.streamingInterval) return;

    console.log(`[BrowserAgent] Starting stream for page: ${pageId}`);
    
    pageData.streamingInterval = setInterval(async () => {
      try {
        if (page.isClosed()) {
          this.stopStreaming(pageId);
          return;
        }
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 50 });
        this.io.emit('browserStream', {
          pageId,
          image: screenshot.toString('base64')
        });
      } catch (err) {
        // Ignore errors during streaming
      }
    }, 200); // 5 frames per second for better live feel
  }

  /**
   * Stop streaming screenshots
   */
  stopStreaming(pageId = 'default') {
    const pageData = this.pages.get(pageId);
    if (pageData && pageData.streamingInterval) {
      clearInterval(pageData.streamingInterval);
      pageData.streamingInterval = null;
      console.log(`[BrowserAgent] Stopped stream for page: ${pageId}`);
    }
  }

  /**
   * Open a new page/tab
   */
  async openPage(pageId = 'default') {
    console.log(`[BrowserAgent] Opening new page: ${pageId}`);
    try {
      if (!this.browser) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return initResult;
        }
      }

      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      this.pages.set(pageId, { page, context, streamingInterval: null });
      
      // Automatically start streaming when a page is opened
      this.startStreaming(pageId);
      
      return { success: true, pageId };
    } catch (error) {
      console.error('[BrowserAgent] Failed to open page:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url, pageId = 'default') {
    console.log(`[BrowserAgent] Navigating to: ${url}`);
    try {
      let pageData = this.pages.get(pageId);
      if (!pageData) {
        const openResult = await this.openPage(pageId);
        if (!openResult.success) return openResult;
        pageData = this.pages.get(pageId);
      }

      const page = pageData.page;
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.browserTimeout });

      return { success: true, url, pageId };
    } catch (error) {
      console.error('[BrowserAgent] Navigation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Click an element
   */
  async click(selector, pageId = 'default') {
    console.log(`[BrowserAgent] Clicking element: ${selector}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      await page.click(selector);
      return { success: true, selector };
    } catch (error) {
      console.error('[BrowserAgent] Click failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Type text into an element
   */
  async type(selector, text, pageId = 'default') {
    console.log(`[BrowserAgent] Typing into: ${selector}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // 1. Click to ensure focus
      await page.click(selector, { timeout: 5000 }).catch(() => {});
      
      // 2. Clear existing text
      await page.fill(selector, '').catch(() => {});
      
      // 3. Type with a human-like delay
      await page.type(selector, text, { delay: 50 });
      
      // 4. Verify the value
      const currentValue = await page.inputValue(selector).catch(() => '');
      if (currentValue !== text) {
        console.warn(`[BrowserAgent] Type verification failed for ${selector}. Falling back to fill.`);
        await page.fill(selector, text);
      }

      return { success: true, selector, text };
    } catch (error) {
      console.error('[BrowserAgent] Type failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit a form
   */
  async submitForm(formSelector, pageId = 'default') {
    console.log(`[BrowserAgent] Submitting form: ${formSelector}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // Using a safer method to submit form to avoid "form.submit is not a function" error
      // which happens if there is an input named "submit" in the form.
      await page.evaluate((selector) => {
        const form = document.querySelector(selector);
        if (form) {
          if (typeof form.submit === 'function') {
            form.submit();
          } else {
            // Fallback: Use the prototype method if the instance method is shadowed
            HTMLFormElement.prototype.submit.call(form);
          }
        }
      }, formSelector);

      return { success: true, formSelector };
    } catch (error) {
      console.error('[BrowserAgent] Form submission failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get interactive elements from the page for AI understanding
   */
  async getInteractiveElements(pageId = 'default') {
    console.log(`[BrowserAgent] Extracting interactive elements for page: ${pageId}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const elements = await page.evaluate(() => {
        const interactiveSelectors = [
          'button', 'a', 'input', 'textarea', 'select', 
          '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="menuitem"]',
          '[onclick]', '.btn', '.button'
        ];
        
        const results = [];
        const seen = new Set();
        let idCounter = 1;

        interactiveSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            if (seen.has(el)) return;
            
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0 && 
                             style.display !== 'none' &&
                             style.visibility !== 'hidden' &&
                             style.opacity !== '0';

            if (isVisible) {
              seen.add(el);
              const agentId = idCounter++;
              el.setAttribute('data-agent-id', agentId.toString());
              
              const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : el.closest('label');
              const labelText = label ? label.innerText.trim() : '';
              
              const options = [];
              if (el.tagName === 'SELECT') {
                Array.from(el.options).forEach(opt => {
                  options.push({
                    text: opt.text,
                    value: opt.value,
                    selected: opt.selected
                  });
                });
              }
              
              results.push({
                id: agentId,
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                text: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim().substring(0, 100),
                label: labelText,
                options: options.length > 0 ? options : undefined,
                role: el.getAttribute('role') || '',
                name: el.name || '',
                id_attr: el.id || '',
                class: el.className || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                placeholder: el.getAttribute('placeholder') || '',
                rect: {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                }
              });
            }
          });
        });
        return results;
      });

      return { success: true, elements };
    } catch (error) {
      console.error('[BrowserAgent] Failed to extract interactive elements:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get accessibility tree from the page for AI understanding
   * This is much more token-efficient than sending the full DOM
   */
  async getAccessibilityTree(pageId = 'default') {
    console.log(`[BrowserAgent] Extracting accessibility tree for page: ${pageId}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // Use the modern ariaSnapshot API (Playwright v1.46+)
      // Falls back to a DOM-based summary if not available
      let tree = '';
      try {
        tree = await page.ariaSnapshot();
      } catch (ariaErr) {
        // Fallback: build a simple text summary from DOM
        tree = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('h1,h2,h3,button,a,input,textarea,select,[role]'));
          return els.slice(0, 100).map(el => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || tag;
            const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '').trim().substring(0, 80);
            return `@${role} "${label}"`;
          }).join('\n');
        }).catch(() => 'Could not extract accessibility tree');
      }

      return { success: true, tree };
    } catch (error) {
      console.error('[BrowserAgent] Failed to extract accessibility tree:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract page content
   */
  async extractContent(pageId = 'default') {
    console.log(`[BrowserAgent] Extracting page content`);
    try {
      let pageData = this.pages.get(pageId);
      if (!pageData) {
        const openResult = await this.openPage(pageId);
        if (!openResult.success) return openResult;
        pageData = this.pages.get(pageId);
      }
      const page = pageData.page;

      const content = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText,
        html: document.documentElement.outerHTML,
      }));

      return { success: true, content };
    } catch (error) {
      console.error('[BrowserAgent] Content extraction failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download a file
   */
  async downloadFile(downloadPath, pageId = 'default') {
    console.log(`[BrowserAgent] Setting up download to: ${downloadPath}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const downloadPromise = page.waitForEvent('download');
      const download = await downloadPromise;
      await download.saveAs(downloadPath);

      return { success: true, downloadPath, filename: download.suggestedFilename() };
    } catch (error) {
      console.error('[BrowserAgent] Download failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for user interaction (e.g., CAPTCHA)
   */
  async waitForUser(timeout = 300000, pageId = 'default') {
    console.log(`[BrowserAgent] Waiting for user interaction on page: ${pageId}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      return { success: true, message: 'Waiting for user interaction' };
    } catch (error) {
      console.error('[BrowserAgent] Wait for user failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for a selector to appear in the DOM
   */
  async waitForSelector(selector, timeout = 30000, pageId = 'default') {
    console.log(`[BrowserAgent] Waiting for selector: ${selector} on page: ${pageId}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      await page.waitForSelector(selector, { timeout });
      return { success: true, selector };
    } catch (error) {
      console.error(`[BrowserAgent] Waiting for selector ${selector} failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute JavaScript in the browser context
   */
  async evaluate(script, pageId = 'default') {
    console.log(`[BrowserAgent] Executing script on page: ${pageId}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const result = await page.evaluate(script);
      return { success: true, result };
    } catch (error) {
      console.error('[BrowserAgent] Script execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(filePath, pageId = 'default') {
    console.log(`[BrowserAgent] Taking screenshot: ${filePath}`);
    try {
      if (!this.browser || !this.browser.isConnected()) {
        console.warn('[BrowserAgent] Browser disconnected, re-initializing...');
        await this.initialize(this.io);
      }

      let pageData = this.pages.get(pageId);
      if (!pageData || pageData.page.isClosed()) {
        console.warn(`[BrowserAgent] Page ${pageId} is missing or closed, opening new page...`);
        const openResult = await this.openPage(pageId);
        if (!openResult.success) return openResult;
        pageData = this.pages.get(pageId);
      }
      
      const page = pageData.page;

      // Ensure page is loaded enough to take a screenshot
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      } catch (e) {
        // Ignore timeout
      }

      await page.screenshot({ path: filePath, timeout: 10000 });
      return { success: true, filePath };
    } catch (error) {
      console.error('[BrowserAgent] Screenshot failed:', error);
      
      // If it's a "Target closed" error, try to recover by re-opening the page next time
      if (error.message.includes('Target closed') || error.message.includes('context closed')) {
        this.pages.delete(pageId);
      }
      
      return { success: false, error: `Screenshot failed: ${error.message}` };
    }
  }

  /**
   * Scroll the page
   */
  async scroll(direction = 'down', amount = 500, pageId = 'default') {
    console.log(`[BrowserAgent] Scrolling ${direction} by ${amount}px`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      const scrollAmount = direction === 'down' ? amount : -amount;
      await page.evaluate((y) => window.scrollBy(0, y), scrollAmount);
      return { success: true, direction, amount };
    } catch (error) {
      console.error('[BrowserAgent] Scroll failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Move mouse to coordinates
   */
  async moveMouse(x, y, pageId = 'default') {
    console.log(`[BrowserAgent] Moving mouse to (${x}, ${y})`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      await page.mouse.move(x, y);
      return { success: true, x, y };
    } catch (error) {
      console.error('[BrowserAgent] Mouse move failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Press a key on the keyboard
   */
  async pressKey(key, pageId = 'default') {
    console.log(`[BrowserAgent] Pressing key: ${key}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      await page.keyboard.press(key);
      return { success: true, key };
    } catch (error) {
      console.error('[BrowserAgent] Key press failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector, value, pageId = 'default') {
    console.log(`[BrowserAgent] Selecting option ${value} in ${selector}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      await page.selectOption(selector, value);
      return { success: true, selector, value };
    } catch (error) {
      console.error('[BrowserAgent] Select option failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload a file to an input element
   */
  async uploadFile(selector, filePath, pageId = 'default') {
    console.log(`[BrowserAgent] Uploading file ${filePath} to ${selector}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      await page.setInputFiles(selector, filePath);
      return { success: true, selector, filePath };
    } catch (error) {
      console.error('[BrowserAgent] File upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find a keyword in the page
   */
  async findKeyword(keyword, pageId = 'default') {
    console.log(`[BrowserAgent] Finding keyword: ${keyword}`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      const found = await page.evaluate((kw) => {
        return window.find(kw);
      }, keyword);
      return { success: true, keyword, found };
    } catch (error) {
      console.error('[BrowserAgent] Find keyword failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fill multiple form fields at once
   */
  async fillForm(data, pageId = 'default') {
    console.log(`[BrowserAgent] Filling form with ${Object.keys(data).length} fields`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      for (const [selector, value] of Object.entries(data)) {
        await page.fill(selector, value);
      }
      return { success: true, fields: Object.keys(data) };
    } catch (error) {
      console.error('[BrowserAgent] Fill form failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a full observation of the current page state.
   * Called by the ReActLoop on every iteration.
   */
  async getObservation(pageId = 'default') {
    try {
      // If browser is not running, return a safe fallback
      if (!this.browser || !this.browser.isConnected()) {
        return {
          success: false,
          error: 'Browser not initialized or disconnected'
        };
      }

      let pageData = this.pages.get(pageId);
      if (!pageData || pageData.page.isClosed()) {
        // Try to open a new page
        const openResult = await this.openPage(pageId);
        if (!openResult.success) {
          return { success: false, error: 'Could not open browser page: ' + openResult.error };
        }
        pageData = this.pages.get(pageId);
      }

      const page = pageData.page;

      // Get basic page info
      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => '');

      // Get page text content (truncated to avoid huge payloads)
      const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

      // Get interactive elements
      const interactiveResult = await this.getInteractiveElements(pageId);
      const interactiveElements = interactiveResult.success ? interactiveResult.elements : [];

      // Get accessibility tree
      const treeResult = await this.getAccessibilityTree(pageId);
      const accessibilityTree = treeResult.success ? treeResult.tree : 'Not available';

      // Basic page analysis
      const analysis = {
        url: pageUrl,
        title: pageTitle,
        hasForm: await page.evaluate(() => document.querySelectorAll('form').length > 0).catch(() => false),
        inputCount: await page.evaluate(() => document.querySelectorAll('input, textarea, select').length).catch(() => 0),
        buttonCount: await page.evaluate(() => document.querySelectorAll('button, [role="button"], input[type="submit"]').length).catch(() => 0),
      };

      return {
        success: true,
        pageUrl,
        pageContent: {
          title: pageTitle,
          url: pageUrl,
          text: pageText.substring(0, 3000),
        },
        interactiveElements,
        accessibilityTree,
        analysis,
      };
    } catch (error) {
      console.error('[BrowserAgent] getObservation failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search for a query using Google
   */
  async search(query, pageId = 'default') {
    console.log(`[BrowserAgent] Searching for: ${query}`);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return this.navigate(searchUrl, pageId);
  }

  /**
   * Close a page
   */
  async closePage(pageId = 'default') {
    console.log(`[BrowserAgent] Closing page: ${pageId}`);
    try {
      const pageData = this.pages.get(pageId);
      if (pageData) {
        await pageData.page.close();
        await pageData.context.close();
        this.pages.delete(pageId);
      }
      return { success: true, pageId };
    } catch (error) {
      console.error('[BrowserAgent] Close failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Close all pages and browser
   */
  async close() {
    console.log('[BrowserAgent] Closing all pages and browser');
    try {
      for (const [pageId] of this.pages) {
        await this.closePage(pageId);
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      return { success: true };
    } catch (error) {
      console.error('[BrowserAgent] Close failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get list of open pages
   */
  getOpenPages() {
    return Array.from(this.pages.keys());
  }
}

module.exports = BrowserAgent;
