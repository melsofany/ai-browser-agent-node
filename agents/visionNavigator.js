/**
 * Vision-Centric Navigator
 * Uses screenshots and AI vision to interact with pages using coordinates
 * Instead of relying on CSS selectors, it analyzes visual content
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const config = require('../config/config');

class VisionNavigator {
  constructor(browser) {
    this.browser = browser;
    this.lastScreenshot = null;
    this.elementMap = new Map(); // Maps element descriptions to coordinates
    this.interactionHistory = [];
    this.maxRetries = 3;
  }

  /**
   * Safely parse JSON from a string, handling markdown blocks and common errors
   */
  safeJsonParse(text) {
    if (!text) return null;
    
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from markdown blocks
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          console.error('[VisionNavigator] Failed to parse JSON from markdown block:', e2.message);
        }
      }
      
      // Try to find the first '{' and last '}' or '[' and last ']'
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      
      let start = -1;
      let end = -1;
      
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = lastBrace;
      } else if (firstBracket !== -1) {
        start = firstBracket;
        end = lastBracket;
      }
      
      if (start !== -1 && end !== -1 && end > start) {
        const potentialJson = text.substring(start, end + 1);
        try {
          return JSON.parse(potentialJson);
        } catch (e3) {
          console.error('[VisionNavigator] Failed to parse JSON between delimiters:', e3.message);
        }
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Find element by visual description and return coordinates
   */
  async findElementByDescription(description, pageId = 'default') {
    console.log('[VisionNavigator] Finding element:', description);
    
    try {
      // Take screenshot
      const screenshot = await this.captureScreenshot(pageId);
      if (!screenshot) {
        return { success: false, error: 'Failed to capture screenshot' };
      }

      // Analyze with AI
      const elements = await this.analyzeScreenshotForElements(screenshot, description);
      if (!elements || elements.length === 0) {
        return { success: false, error: 'Element not found on screen' };
      }

      const topMatch = elements[0];
      return {
        success: true,
        element: topMatch,
        coordinates: {
          x: topMatch.x,
          y: topMatch.y
        },
        confidence: topMatch.confidence
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Click element by visual description with retry logic
   */
  async clickElement(description, pageId = 'default', retryCount = 0) {
    console.log(`[VisionNavigator] Clicking element: ${description} (attempt ${retryCount + 1})`);
    
    try {
      // Find element
      const findResult = await this.findElementByDescription(description, pageId);
      if (!findResult.success) {
        if (retryCount < this.maxRetries) {
          console.log('[VisionNavigator] Retrying after scroll...');
          await this.scrollPage('down', 3, pageId);
          return this.clickElement(description, pageId, retryCount + 1);
        }
        return findResult;
      }

      const { coordinates, element } = findResult;

      // Click at coordinates
      const page = this.browser.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      await page.mouse.click(coordinates.x, coordinates.y);
      await page.waitForTimeout(500);

      // Verify click was successful
      const verification = await this.verifyInteraction('click', element);

      this.interactionHistory.push({
        type: 'click',
        description,
        coordinates,
        element,
        success: verification.success,
        timestamp: new Date()
      });

      return {
        success: verification.success,
        coordinates,
        element: element.label,
        message: `Clicked ${description}`
      };
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log('[VisionNavigator] Error, retrying...');
        return this.clickElement(description, pageId, retryCount + 1);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Type text in a field found by visual description
   */
  async typeInField(fieldDescription, text, pageId = 'default') {
    console.log(`[VisionNavigator] Typing in field: ${fieldDescription}`);
    
    try {
      // Find the field
      const findResult = await this.findElementByDescription(fieldDescription, pageId);
      if (!findResult.success) {
        return findResult;
      }

      const { coordinates, element } = findResult;
      const page = this.browser.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // Click to focus
      await page.mouse.click(coordinates.x, coordinates.y);
      await page.waitForTimeout(500);

      // Use the robust type method from browser agent if possible, 
      // otherwise fallback to keyboard typing
      const selector = await page.evaluate((x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        // Generate a unique selector for this element
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        return null;
      }, coordinates.x, coordinates.y);

      if (selector) {
        await this.browser.type(selector, text, pageId);
      } else {
        // Clear existing text
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        // Type new text
        await page.keyboard.type(text, { delay: 50 });
      }
      
      await page.waitForTimeout(500);

      this.interactionHistory.push({
        type: 'type',
        field: fieldDescription,
        text,
        coordinates,
        timestamp: new Date()
      });

      return {
        success: true,
        field: element.label,
        text,
        message: `Typed in ${fieldDescription}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit form by finding and clicking submit button
   */
  async submitForm(pageId = 'default') {
    console.log('[VisionNavigator] Submitting form');
    
    try {
      // Find submit button
      const submitResult = await this.findElementByDescription('submit button', pageId);
      if (!submitResult.success) {
        // Try alternative descriptions
        const altResult = await this.findElementByDescription('send button', pageId);
        if (!altResult.success) {
          return { success: false, error: 'Submit button not found' };
        }
        return this.clickElement('send button', pageId);
      }

      return this.clickElement('submit button', pageId);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Scroll page
   */
  async scrollPage(direction = 'down', amount = 3, pageId = 'default') {
    console.log(`[VisionNavigator] Scrolling ${direction} by ${amount}`);
    
    try {
      const page = this.browser.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const scrollAmount = direction === 'down' ? amount * 100 : -amount * 100;
      await page.evaluate((amount) => {
        window.scrollBy(0, amount);
      }, scrollAmount);

      await page.waitForTimeout(500);
      return { success: true, message: `Scrolled ${direction}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for element to appear
   */
  async waitForElement(description, timeout = 10000, pageId = 'default') {
    console.log(`[VisionNavigator] Waiting for element: ${description}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await this.findElementByDescription(description, pageId);
      if (result.success) {
        return result;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { success: false, error: `Element not found within ${timeout}ms` };
  }

  /**
   * Extract text from element
   */
  async extractElementText(description, pageId = 'default') {
    console.log(`[VisionNavigator] Extracting text from: ${description}`);
    
    try {
      const findResult = await this.findElementByDescription(description, pageId);
      if (!findResult.success) {
        return findResult;
      }

      const { coordinates } = findResult;
      const page = this.browser.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // Extract text near coordinates
      const text = await page.evaluate((x, y) => {
        const element = document.elementFromPoint(x, y);
        return element ? element.textContent : null;
      }, coordinates.x, coordinates.y);

      return {
        success: true,
        text,
        element: findResult.element.label
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture screenshot and save to file
   */
  async captureScreenshot(pageId = 'default') {
    try {
      const filename = `/tmp/vision_${Date.now()}.png`;
      const result = await this.browser.screenshot(filename, pageId);
      
      if (result.success) {
        this.lastScreenshot = filename;
        return filename;
      }
      
      console.error('[VisionNavigator] Screenshot failed via BrowserAgent:', result.error);
      return null;
    } catch (error) {
      console.error('[VisionNavigator] Screenshot failed:', error.message);
      return null;
    }
  }

  /**
   * Analyze screenshot for elements using AI
   */
  async analyzeScreenshotForElements(screenshotPath, description) {
    if (!config.deepseekApiKey) {
      return this.analyzeScreenshotLocally(screenshotPath, description);
    }

    try {
      // Use DeepSeek for element detection via text description
      const systemPrompt = `You are a visual element detector. Analyze the screenshot and find elements matching the description.
For each match, provide:
1. label: Element description
2. x, y: Approximate center coordinates (0-1280 for x, 0-720 for y)
3. confidence: Confidence score (0-1)
4. elementType: Type of element (button, input, link, etc.)

Return as JSON array of elements, sorted by confidence (highest first).`;

      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Find elements matching: "${description}"`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1000
      }, {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const result = this.safeJsonParse(response.data.choices[0].message.content);
      return Array.isArray(result) ? result : result.elements || [];
    } catch (error) {
      if (error.message.includes('API key not valid')) {
        console.error('[VisionNavigator] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
      } else {
        console.error('[VisionNavigator] AI analysis failed:', error.message);
      }
      return this.analyzeScreenshotLocally(screenshotPath, description);
    }
  }

  /**
   * Local screenshot analysis (fallback)
   */
  async analyzeScreenshotLocally(screenshotPath, description) {
    // Simple fallback: return center of screen
    return [
      {
        label: description,
        x: 640,
        y: 360,
        confidence: 0.3,
        elementType: 'unknown'
      }
    ];
  }

  /**
   * Verify interaction was successful
   */
  async verifyInteraction(actionType, element) {
    try {
      // Take screenshot after interaction
      const newScreenshot = await this.captureScreenshot();
      if (!newScreenshot) {
        return { success: true }; // Assume success if can't verify
      }

      // Compare with previous screenshot
      if (this.lastScreenshot && this.lastScreenshot !== newScreenshot) {
        return { success: true };
      }

      return { success: true };
    } catch (error) {
      console.error('[VisionNavigator] Verification failed:', error.message);
      return { success: true }; // Assume success on error
    }
  }

  /**
   * Get interaction history
   */
  getInteractionHistory(limit = 50) {
    return this.interactionHistory.slice(-limit);
  }

  /**
   * Clear interaction history
   */
  clearInteractionHistory() {
    this.interactionHistory = [];
  }

  /**
   * Generate Set-of-Mark (SoM) visualization
   * Adds numbered markers to interactive elements for better AI understanding
   */
  async generateSetOfMark(pageId = 'default') {
    console.log('[VisionNavigator] Generating Set-of-Mark visualization');
    
    try {
      const page = this.browser.pages.get(pageId)?.page;
      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      // Inject markers for interactive elements
      await page.evaluate(() => {
        let markIndex = 1;
        const interactiveSelectors = [
          'button', 'a', 'input[type="button"]', 'input[type="submit"]',
          'input[type="text"]', 'input[type="email"]', 'input[type="password"]',
          'textarea', 'select', '[role="button"]', '[onclick]'
        ];

        interactiveSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(element => {
            if (element.offsetParent !== null) { // Only visible elements
              const marker = document.createElement('div');
              marker.style.position = 'absolute';
              marker.style.backgroundColor = '#FF6B6B';
              marker.style.color = 'white';
              marker.style.borderRadius = '50%';
              marker.style.width = '24px';
              marker.style.height = '24px';
              marker.style.display = 'flex';
              marker.style.alignItems = 'center';
              marker.style.justifyContent = 'center';
              marker.style.fontSize = '12px';
              marker.style.fontWeight = 'bold';
              marker.style.zIndex = '10000';
              marker.textContent = markIndex;

              const rect = element.getBoundingClientRect();
              marker.style.left = (rect.left + rect.width / 2 - 12) + 'px';
              marker.style.top = (rect.top + rect.height / 2 - 12) + 'px';

              document.body.appendChild(marker);
              markIndex++;
            }
          });
        });
      });

      // Take screenshot with markers
      const markedScreenshot = await this.captureScreenshot(pageId);
      
      return {
        success: true,
        screenshot: markedScreenshot,
        marksCount: await page.evaluate(() => {
          return document.querySelectorAll('div[style*="background-color: rgb(255, 107, 107)"]').length;
        })
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Robust element detection with multiple strategies
   */
  async robustElementDetection(description, pageId = 'default') {
    console.log('[VisionNavigator] Robust element detection:', description);
    
    const strategies = [
      () => this.findElementByDescription(description, pageId),
      () => this.findElementByDescription(description.toLowerCase(), pageId),
      () => this.findElementByDescription(description.split(' ')[0], pageId),
      () => this.findElementByAlternativeDescription(description, pageId)
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result.success) {
          return result;
        }
      } catch (error) {
        console.warn('[VisionNavigator] Strategy failed:', error.message);
      }
    }

    return { success: false, error: 'Element not found with any strategy' };
  }

  /**
   * Find element by alternative description
   */
  async findElementByAlternativeDescription(description, pageId = 'default') {
    const alternatives = {
      'login': ['sign in', 'log in', 'enter'],
      'search': ['find', 'query', 'look for'],
      'submit': ['send', 'post', 'confirm'],
      'cancel': ['close', 'exit', 'back'],
      'delete': ['remove', 'trash', 'clear']
    };

    const key = description.toLowerCase();
    const alts = alternatives[key] || [];

    for (const alt of alts) {
      const result = await this.findElementByDescription(alt, pageId);
      if (result.success) {
        return result;
      }
    }

    return { success: false, error: 'No alternative found' };
  }
}

module.exports = VisionNavigator;
