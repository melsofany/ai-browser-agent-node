/**
 * Browser Agent
 * Controls the browser using Playwright
 * Handles navigation, clicking, typing, form submission, and content extraction
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { execSync } = require('child_process');
const DesktopAgent = require('./desktopAgent');

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
    this.headless = false; // Always non-headless for real desktop
    this.desktop = new DesktopAgent();
  }

  /**
   * Initialize the browser
   */
  async initialize(io = null) {
    console.log('[BrowserAgent] Initializing browser...');
    this.io = io;

    // Start virtual desktop with VNC
    const desktopResult = await this.desktop.start();
    if (!desktopResult.success) {
      console.warn('[BrowserAgent] Failed to start desktop, continuing without VNC:', desktopResult.error);
    } else {
      console.log(`[BrowserAgent] Desktop started: ${desktopResult.display} (VNC port ${desktopResult.vncPort})`);
    }

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-gpu',
    ];

    const displayEnv = this.desktop.getDisplay() || process.env.DISPLAY;
    const envVars = { ...process.env };
    if (displayEnv) envVars.DISPLAY = displayEnv;

    // First attempt: use default Playwright bundled browser
    try {
      this.browser = await chromium.launch({
        headless: false,
        args: launchArgs,
        env: envVars
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
          headless: false,
          args: launchArgs,
          env: envVars
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
   * Capture desktop screen (VNC or X11)
   */
  async _captureDesktop() {
    try {
      // Try desktop agent capture (VNC/X11)
      return await this.desktop.captureScreen();
    } catch (err) {
      console.warn('[BrowserAgent] Desktop capture failed:', err.message);
      return null;
    }
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

    // Use recursive setTimeout to avoid overlapping screenshots
    const captureFrame = async () => {
      const data = this.pages.get(pageId);
      if (!data || !data.streaming) return;

      try {
        // Try desktop capture first (full screen, includes everything)
        let screenshot = await this._captureDesktop();
        
        // Fallback to Playwright screenshot if desktop capture fails
        if (!screenshot && !page.isClosed()) {
          screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        }
        
        if (screenshot && this.io) {
          this.io.emit('browserStream', {
            pageId,
            image: screenshot.toString('base64')
          });
        }
      } catch (err) {
        // Ignore errors during streaming
      }

      const d2 = this.pages.get(pageId);
      if (d2 && d2.streaming) {
        d2.streamingTimeout = setTimeout(captureFrame, 150);
      }
    };

    pageData.streaming = true;
    pageData.streamingInterval = true; // keep compatibility flag
    pageData.streamingTimeout = setTimeout(captureFrame, 150);
  }

  /**
   * Stop streaming screenshots
   */
  stopStreaming(pageId = 'default') {
    const pageData = this.pages.get(pageId);
    if (pageData && pageData.streaming) {
      pageData.streaming = false;
      pageData.streamingInterval = null;
      if (pageData.streamingTimeout) {
        clearTimeout(pageData.streamingTimeout);
        pageData.streamingTimeout = null;
      }
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

      // Limit tree size to avoid sending huge payloads to AI
      const MAX_TREE_CHARS = 3000;
      if (tree.length > MAX_TREE_CHARS) {
        tree = tree.substring(0, MAX_TREE_CHARS) + '\n...[truncated]';
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
        text: document.body.innerText?.substring(0, 5000) || '',
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
   * Self-discovery: scans all visible inputs/selects/textareas on the page
   * and returns their attributes so we can match semantically without hardcoding.
   */
  async _discoverPageFields(page) {
    return page.evaluate(() => {
      const fields = [];
      const inputs = document.querySelectorAll('input, select, textarea');

      inputs.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return; // hidden
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;

        // Find associated label text
        let labelText = '';
        if (el.id) {
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label) labelText = label.textContent.trim();
        }
        if (!labelText) {
          const parent = el.closest('label');
          if (parent) labelText = parent.textContent.replace(el.value, '').trim();
        }
        if (!labelText) {
          // Look for adjacent label/span/div above or before
          let sibling = el.previousElementSibling;
          for (let i = 0; i < 3 && sibling; i++) {
            const t = sibling.textContent.trim();
            if (t.length < 60 && t.length > 1) { labelText = t; break; }
            sibling = sibling.previousElementSibling;
          }
        }

        // Collect all hint text into one string for scoring
        const hints = [
          el.name || '',
          el.id || '',
          el.placeholder || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('aria-placeholder') || '',
          el.getAttribute('autocomplete') || '',
          el.getAttribute('data-testid') || '',
          labelText,
        ].join(' ').toLowerCase();

        fields.push({
          index: idx,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          name: el.name || '',
          id: el.id || '',
          placeholder: el.placeholder || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          autocomplete: el.getAttribute('autocomplete') || '',
          labelText,
          hints,
          agentId: el.getAttribute('data-agent-id') || null,
          selector: el.id
            ? `#${CSS.escape(el.id)}`
            : el.name
              ? `${el.tagName.toLowerCase()}[name="${el.name}"]`
              : `[data-agent-id="${el.getAttribute('data-agent-id')}"]`,
        });
      });

      return fields;
    });
  }

  /**
   * Score how well a semantic field name matches a discovered element.
   * Pure keyword scoring — no hardcoded field lists.
   */
  _scoreFieldMatch(fieldKey, field) {
    let score = 0;
    const needle = fieldKey.toLowerCase().replace(/[_\s\-]/g, '');
    const hints = field.hints;

    // Semantic keyword maps covering many languages
    const SEMANTICS = {
      first:    ['first','given','fname','prénom','vorname','الاسم','given'],
      last:     ['last','family','surname','lname','nom','nachname','العائلة','second'],
      name:     ['name','nom','nombre','اسم'],
      email:    ['email','mail','e-mail','البريد','correo'],
      password: ['password','passwd','pass','كلمة','mot de passe','contraseña','pw'],
      confirm:  ['confirm','repeat','retype','verify','again'],
      phone:    ['phone','mobile','tel','cel','هاتف','téléphone','celular'],
      birthday: ['birth','born','dob','bday','ميلاد','naissance','geburt'],
      month:    ['month','mois','monat','شهر'],
      day:      ['day','jour','tag','يوم'],
      year:     ['year','année','jahr','سنة','año'],
      gender:   ['gender','sex','جنس','sexe'],
      username: ['username','login','user','handle'],
      address:  ['address','street','addr','عنوان','adresse'],
      city:     ['city','ville','stadt','مدينة'],
      zip:      ['zip','postal','postcode','code'],
      country:  ['country','pays','land','بلد'],
    };

    // Break fieldKey into semantic atoms
    const atoms = fieldKey.toLowerCase().split(/[_\s\-]+/);

    // Score: exact word match in any hint attribute
    for (const atom of atoms) {
      const atomNorm = atom.replace(/[_\s\-]/g, '');
      if (hints.includes(atomNorm)) score += 30;
      else if (hints.includes(atom)) score += 25;

      // Synonym match
      for (const [concept, keywords] of Object.entries(SEMANTICS)) {
        if (keywords.some(k => atom.includes(k) || k.includes(atom))) {
          if (keywords.some(k => hints.includes(k))) score += 20;
        }
      }
    }

    // Bonus: type matches expected type
    if (atoms.includes('email') && field.type === 'email') score += 25;
    if ((atoms.includes('password') || atoms.includes('pass')) && field.type === 'password') score += 40;
    if (atoms.includes('phone') && field.type === 'tel') score += 25;
    if ((atoms.includes('month') || atoms.includes('day') || atoms.includes('year')) && field.tag === 'select') score += 20;
    if (atoms.includes('gender') && field.tag === 'select') score += 15;

    // Full needle match anywhere in hints
    if (hints.includes(needle)) score += 35;

    // autocomplete is highly reliable
    const ac = field.autocomplete.replace('-', '');
    if (ac === needle) score += 50;

    return score;
  }

  /**
   * Smart select option for <select> elements.
   * Tries multiple strategies: value, label, partial text, number index, month name mapping.
   */
  async _smartSelectOption(page, selector, val, fieldKey = '') {
    const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const MONTHS_EN = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const MONTHS_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

    // Attempt Playwright helper with multiple strategies
    const tryPW = async (strategy) => {
      try { await page.selectOption(selector, strategy); return true; } catch { return false; }
    };

    if (await tryPW({ value: val }))           return true;
    if (await tryPW({ label: val }))           return true;
    if (await tryPW({ label: new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) return true;
    if (!isNaN(val) && await tryPW({ index: parseInt(val) - 1 }))                             return true;

    // Month name → number mapping and vice versa
    const key = fieldKey.toLowerCase();
    if (key.includes('month')) {
      const numVal = parseInt(val);
      // val is a number (1-12) — try month label forms
      if (!isNaN(numVal) && numVal >= 1 && numVal <= 12) {
        const idx = numVal - 1;
        if (await tryPW({ label: MONTHS_AR[idx] }))              return true;
        if (await tryPW({ label: MONTHS_EN[idx] }))              return true;
        if (await tryPW({ label: MONTHS_EN[idx].charAt(0).toUpperCase() + MONTHS_EN[idx].slice(1) })) return true;
        if (await tryPW({ label: MONTHS_SHORT[idx] }))           return true;
        if (await tryPW({ index: idx }))                         return true;
      }
      // val is a month name — try numeric
      const arIdx = MONTHS_AR.findIndex(m => m === val);
      const enIdx = MONTHS_EN.findIndex(m => m === val.toLowerCase());
      const shIdx = MONTHS_SHORT.findIndex(m => m === val.toLowerCase().slice(0,3));
      const resolvedIdx = arIdx >= 0 ? arIdx : enIdx >= 0 ? enIdx : shIdx >= 0 ? shIdx : -1;
      if (resolvedIdx >= 0) {
        if (await tryPW({ index: resolvedIdx }))                 return true;
        if (await tryPW({ value: String(resolvedIdx + 1) }))     return true;
      }
    }

    // Final fallback: JavaScript fuzzy select
    const result = await page.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el || el.tagName !== 'SELECT') return false;
      const v = val.toLowerCase().trim();
      const opts = Array.from(el.options);

      // 1. exact value
      let best = opts.find(o => o.value.toLowerCase() === v);
      // 2. exact text
      if (!best) best = opts.find(o => o.text.toLowerCase().trim() === v);
      // 3. value contains val
      if (!best) best = opts.find(o => o.value.toLowerCase().includes(v));
      // 4. text contains val
      if (!best) best = opts.find(o => o.text.toLowerCase().includes(v));
      // 5. val contains option text (good for short words like "Jan")
      if (!best) best = opts.find(o => o.text.trim().length > 1 && v.includes(o.text.toLowerCase().trim()));
      // 6. numeric: if val is a number match option index or numeric value
      const num = parseInt(v);
      if (!best && !isNaN(num) && num >= 1 && num <= opts.length) {
        best = opts.find(o => parseInt(o.value) === num) || opts[num - 1];
      }

      if (best) {
        el.value = best.value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, { sel: selector, val }).catch(() => false);

    return result;
  }

  /**
   * Self-learning form filler:
   * 1. Discovers all real fields on the page
   * 2. Scores each field against the semantic key
   * 3. Fills the best match — no site-specific hardcoding needed
   */
  async _smartFillField(page, fieldKey, value) {
    const val = String(value);

    // Step 1: discover real fields on this page
    const fields = await this._discoverPageFields(page).catch(() => []);
    console.log(`[BrowserAgent] Discovered ${fields.length} fields on page`);

    // Step 2: score each field
    const scored = fields
      .map(f => ({ field: f, score: this._scoreFieldMatch(fieldKey, f) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best = scored[0];
      console.log(`[BrowserAgent] Best match for "${fieldKey}": selector="${best.field.selector}" score=${best.score}`);

      try {
        // Re-find element in live page using its selector
        const el = best.field.agentId
          ? await page.$(`[data-agent-id="${best.field.agentId}"]`)
          : best.field.id
            ? await page.$(`#${CSS.escape(best.field.id)}`)
            : best.field.name
              ? await page.$(`${best.field.tag}[name="${best.field.name}"]`)
              : null;

        if (el && await el.isVisible().catch(() => false)) {
          if (best.field.tag === 'select') {
            await this._smartSelectOption(page, best.field.selector, val, fieldKey);
          } else {
            await el.click({ timeout: 3000 }).catch(() => {});
            await el.fill('').catch(() => {});
            await el.fill(val, { timeout: 5000 });
            // Trigger React/Vue/Angular change events
            await el.evaluate((el, v) => {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (setter) setter.call(el, v);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, val);
          }
          console.log(`[BrowserAgent] ✓ Filled "${fieldKey}" = "${val}" (score=${best.score})`);
          return true;
        }
      } catch (err) {
        console.warn(`[BrowserAgent] Fill attempt failed for "${fieldKey}":`, err.message);
      }
    }

    // Step 3: fallback — inject value via JS using any matching discovered element
    const fallback = await page.evaluate(({ fieldKey, val }) => {
      const needle = fieldKey.toLowerCase().replace(/[_\s\-]/g, '');
      const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea'));
      
      for (const el of inputs) {
        const hints = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.getAttribute('type')]
          .filter(Boolean).join(' ').toLowerCase().replace(/[_\s\-]/g, '');
        
        if (hints.includes(needle) || needle.includes(hints.substring(0, 4))) {
          if (el.tagName === 'SELECT') {
            const opt = Array.from(el.options).find(o =>
              o.value.toLowerCase().includes(val.toLowerCase()) ||
              o.text.toLowerCase().includes(val.toLowerCase())
            );
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
          } else {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, { fieldKey, val });

    if (fallback) {
      console.log(`[BrowserAgent] ✓ JS-injected "${fieldKey}" = "${val}"`);
      return true;
    }

    console.warn(`[BrowserAgent] ✗ Could not fill field: "${fieldKey}"`);
    return false;
  }

  /**
   * Fill multiple form fields — uses self-discovery engine
   */
  async fillForm(data, pageId = 'default') {
    console.log(`[BrowserAgent] Filling form with ${Object.keys(data).length} fields`);
    try {
      const page = this.pages.get(pageId)?.page;
      if (!page) return { success: false, error: 'Page not found' };

      const failed = [];
      for (const [fieldKey, value] of Object.entries(data)) {
        const ok = await this._smartFillField(page, fieldKey, value);
        if (!ok) failed.push(fieldKey);
        await page.waitForTimeout(300).catch(() => {});
      }

      if (failed.length > 0 && failed.length === Object.keys(data).length) {
        return { success: false, error: `Could not fill any fields: ${failed.join(', ')}` };
      }
      if (failed.length > 0) {
        return { success: true, partial: true, failedFields: failed, filledFields: Object.keys(data).filter(k => !failed.includes(k)) };
      }
      return { success: true, fields: Object.keys(data) };
    } catch (error) {
      console.error('[BrowserAgent] Fill form error:', error);
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

      // NOTE: We do NOT send full page text to AI - use accessibility tree instead

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
