/**
 * Browser Executor Agent
 * Responsible for executing individual browser actions planned by the Planner
 */

const dataGenerator = require('./dataGenerator');

class BrowserExecutor {
  constructor() {
    this.history = [];
  }

  /**
   * Execute a specific action using the browser
   */
  async executeAction(action, browser, context = {}) {
    console.log(`[BrowserExecutor] Executing action: ${action.type}`);
    
    try {
      let result;
      
      switch (action.type) {
        case 'click':
          result = await this.actionClick(browser, action.params);
          break;
        case 'type':
          result = await this.actionType(browser, action.params);
          break;
        case 'scroll':
          result = await this.actionScroll(browser, action.params);
          break;
        case 'wait':
          result = await this.actionWait(action.params);
          break;
        case 'extract':
          result = await this.actionExtract(browser);
          break;
        case 'navigate':
          result = await this.actionNavigate(browser, action.params);
          break;
        case 'move_mouse':
          result = await this.actionMoveMouse(browser, action.params);
          break;
        case 'press_key':
          result = await this.actionPressKey(browser, action.params);
          break;
        case 'select_option':
          result = await this.actionSelectOption(browser, action.params);
          break;
        case 'upload_file':
          result = await this.actionUploadFile(browser, action.params);
          break;
        case 'find_keyword':
          result = await this.actionFindKeyword(browser, action.params);
          break;
        case 'fill_form':
          result = await this.actionFillForm(browser, action.params);
          break;
        case 'message':
          result = await this.actionMessage(action.params);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      this.history.push({ action, result, timestamp: new Date() });
      return result;
    } catch (error) {
      console.error(`[BrowserExecutor] Action failed: ${action.type}`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Action: Click at coordinates or element ID
   */
  async actionClick(browser, params) {
    const { x, y, elementId } = params;
    
    try {
      const page = browser.pages.get('default')?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      if (elementId) {
        // Try data-agent-id first (injected during observation), then text/role fallback
        const selector = `[data-agent-id="${elementId}"]`;
        const el = await page.$(selector).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 5000 });
          return { success: true, message: `Clicked element ${elementId}` };
        }
        // Fallback: try to click by text content if elementId looks like text
        if (typeof elementId === 'string' && isNaN(Number(elementId))) {
          try {
            await page.getByText(elementId, { exact: false }).first().click({ timeout: 5000 });
            return { success: true, message: `Clicked by text: ${elementId}` };
          } catch (_) {}
          try {
            await page.getByRole('button', { name: new RegExp(elementId, 'i') }).first().click({ timeout: 5000 });
            return { success: true, message: `Clicked button: ${elementId}` };
          } catch (_) {}
        }
        return { success: false, error: `Element not found: ${elementId}` };
      }

      if (x && y) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(500);
        return { success: true, message: `Clicked at (${x}, ${y})` };
      }

      return { success: false, error: 'Missing coordinates or elementId' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Action: Type text into element or focused field
   */
  async actionType(browser, params) {
    let { text, elementId } = params;
    if (!text) {
      return { success: false, error: 'No text provided' };
    }

    // Replace placeholders with realistic data if needed
    if (text.startsWith('[') && text.endsWith(']')) {
      const fieldType = text.substring(1, text.length - 1);
      text = dataGenerator.getRealisticValue(fieldType, elementId || '');
    }

    try {
      const page = browser.pages.get('default')?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      if (elementId) {
        const selector = `[data-agent-id="${elementId}"]`;
        const el = await page.$(selector).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) {
          await el.fill(text, { timeout: 5000 });
          return { success: true, message: `Typed into element ${elementId}: ${text}` };
        }
        // Fallback: use smart fill if elementId is a semantic field name
        if (typeof elementId === 'string' && isNaN(Number(elementId))) {
          const filled = await browser._smartFillField(page, elementId, text);
          if (filled) return { success: true, message: `Smart-filled ${elementId}: ${text}` };
        }
      }

      await page.keyboard.type(text);
      return { success: true, message: `Typed: ${text}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Action: Scroll
   */
  async actionScroll(browser, params) {
    const { direction = 'down', amount = 3 } = params;

    try {
      const page = browser.pages.get('default')?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const scrollAmount = direction === 'down' ? amount : -amount;
      await page.evaluate((amount) => {
        window.scrollBy(0, amount * 100);
      }, scrollAmount);

      return { success: true, message: `Scrolled ${direction} by ${amount}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Action: Wait
   */
  async actionWait(params) {
    const { duration = 1000 } = params;
    await new Promise(resolve => setTimeout(resolve, duration));
    return { success: true, message: `Waited ${duration}ms` };
  }

  /**
   * Action: Extract content
   */
  async actionExtract(browser) {
    return await browser.extractContent();
  }

  /**
   * Action: Message (info, ask, result)
   */
  async actionMessage(params) {
    const { type = 'info', content, data } = params;
    console.log(`[BrowserExecutor] MESSAGE [${type}]: ${content}`);
    return { success: true, message: 'Message processed', type, content, data };
  }

  /**
   * Action: Move mouse
   */
  async actionMoveMouse(browser, params) {
    const { x, y } = params;
    if (x === undefined || y === undefined) return { success: false, error: 'Missing coordinates' };
    return browser.moveMouse(x, y);
  }

  /**
   * Action: Press key
   */
  async actionPressKey(browser, params) {
    const { key } = params;
    if (!key) return { success: false, error: 'Missing key' };
    return browser.pressKey(key);
  }

  /**
   * Action: Select option
   */
  async actionSelectOption(browser, params) {
    const { elementId, value } = params;
    if (!elementId || value === undefined) return { success: false, error: 'Missing elementId or value' };
    
    const page = browser.pages.get('default')?.page;
    if (!page) return { success: false, error: 'Page not found' };

    // Try data-agent-id first
    const selector = `[data-agent-id="${elementId}"]`;
    const el = await page.$(selector).catch(() => null);
    if (el && await el.isVisible().catch(() => false)) {
      return browser.selectOption(selector, value);
    }

    // Fallback: smart fill for semantic names (e.g., birthday_month)
    if (typeof elementId === 'string' && isNaN(Number(elementId))) {
      const ok = await browser._smartFillField(page, elementId, String(value));
      if (ok) return { success: true };
    }

    return { success: false, error: `Select element not found: ${elementId}` };
  }

  /**
   * Action: Upload file
   */
  async actionUploadFile(browser, params) {
    const { elementId, filePath } = params;
    if (!elementId || !filePath) return { success: false, error: 'Missing elementId or filePath' };
    const selector = `[data-agent-id="${elementId}"]`;
    return browser.uploadFile(selector, filePath);
  }

  /**
   * Action: Find keyword
   */
  async actionFindKeyword(browser, params) {
    const { keyword } = params;
    if (!keyword) return { success: false, error: 'Missing keyword' };
    return browser.findKeyword(keyword);
  }

  /**
   * Action: Fill form
   */
  async actionFillForm(browser, params) {
    const { data } = params;
    if (!data) return { success: false, error: 'Missing form data' };
    // Pass semantic field names directly; fillForm() uses smart detection
    return browser.fillForm(data);
  }

  /**
   * Action: Navigate
   */
  async actionNavigate(browser, params) {
    const { url } = params;
    if (!url) {
      return { success: false, error: 'No URL provided' };
    }

    return await browser.navigate(url);
  }

  getHistory() {
    return this.history;
  }
}

module.exports = BrowserExecutor;

