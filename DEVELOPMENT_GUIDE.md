# دليل التطوير المتقدم - منصة وكيل الذكاء الاصطناعي

## نظرة عامة على التحديثات الجديدة

تم إضافة 4 مكونات أساسية لتحويل المشروع من "Browser Automation Agent" إلى "Autonomous AI Agent" حقيقي:

### 1. ReAct Loop (حلقة التفكير والعمل)
**الملف:** `agents/reactLoop.js`

يطبق دورة Observe → Think → Plan → Act → Verify للاستقلالية الحقيقية.

```javascript
const ReActLoop = require('./agents/reactLoop');

const loop = new ReActLoop({ maxIterations: 10 });
const result = await loop.executeTask(task, browser, executor);
```

**المميزات:**
- ملاحظة حالة الصفحة عبر لقطات شاشة
- التفكير الذكي باستخدام DeepSeek
- التخطيط الديناميكي للخطوات التالية
- تنفيذ الإجراءات مع التحقق
- استرجاع تلقائي من الأخطاء

---

### 2. Vision-Centric Navigation (الملاحة المرئية)
**الملف:** `agents/visionNavigator.js`

بدل الاعتماد على CSS Selectors، يستخدم الإحداثيات والرؤية الحاسوبية.

```javascript
const VisionNavigator = require('./agents/visionNavigator');

const navigator = new VisionNavigator(browser);

// البحث عن عنصر بالوصف البصري
const result = await navigator.findElementByDescription('زر تسجيل الدخول');

// النقر على عنصر بالوصف
await navigator.clickElement('زر إرسال');

// الكتابة في حقل
await navigator.typeInField('حقل البريد الإلكتروني', 'user@example.com');
```

**المميزات:**
- البحث عن العناصر بالوصف البصري
- Set-of-Mark (SoM) لتحديد العناصر
- إعادة محاولة تلقائية عند الفشل
- كشف العناصر المرئية فقط
- Robust Element Detection

---

### 3. Memory System (نظام الذاكرة)
**الملف:** `agents/memorySystem.js`

تخزين دائم للمهام والتفاعلات والأنماط المتعلمة.

```javascript
const MemorySystem = require('./agents/memorySystem');

const memory = new MemorySystem({ maxMemorySize: 10000 });

// تخزين مهمة
memory.storeTask(taskId, taskData);

// تسجيل تفاعل
memory.recordInteraction({
  type: 'click',
  target: 'button',
  success: true
});

// تعلم نمط
memory.learnPattern('login_pattern', {
  steps: ['navigate', 'fill_email', 'fill_password', 'click_submit']
});

// الحصول على إحصائيات
const stats = memory.getStatistics();
```

**المميزات:**
- تخزين سجل المهام
- تسجيل التفاعلات
- تعلم الأنماط الناجحة
- تسجيل الأخطاء والحلول
- حساب معدل النجاح
- تصدير/استيراد الذاكرة

---

### 4. Stealth Mode (وضع التخفي)
**الملف:** `agents/stealthMode.js`

محاكاة السلوك البشري لتجنب كشف الروبوت.

```javascript
const StealthMode = require('./agents/stealthMode');

const stealth = new StealthMode({
  humanLikeDelays: true,
  randomizeUserAgent: true,
  maskWebDriver: true
});

// تطبيق التخفي على السياق
await stealth.applyStealthToBrowser(context);

// نقر بشري
await stealth.humanLikeClick(page, x, y);

// كتابة بشرية
await stealth.humanLikeType(page, 'text');

// تمرير بشري
await stealth.humanLikeScroll(page, 'down', 3);
```

**المميزات:**
- تأخيرات عشوائية تشبه البشر
- حركة الماوس الطبيعية (منحنيات Bezier)
- سرعة الكتابة المتغيرة
- إخفاء خاصية webdriver
- تغيير User-Agent عشوائياً
- محاكاة السلوك العشوائي

---

### 5. Tool Router (موجه الأدوات)
**الملف:** `agents/toolRouter.js`

توجيه المهام إلى الأدوات المناسبة بناءً على المتطلبات.

```javascript
const ToolRouter = require('./agents/toolRouter');

const router = new ToolRouter({
  browser: browserAgent,
  executor: executionAgent
});

// توجيه مهمة
const result = await router.routeTask(task);

// الحصول على الأدوات المتاحة
const tools = router.getAvailableTools();

// الحصول على أدوات حسب الفئة
const browserTools = router.getToolsByCategory('browser');
```

**الأدوات المتاحة:**
- **Browser:** navigate, click, type, extract, screenshot, submit
- **System:** execute, install
- **Filesystem:** create, read
- **Search:** web
- **Code:** execute

---

## البنية المعمارية الجديدة

```
┌─────────────────────────────────────────┐
│         Task Controller                  │
│  (يدير دورة حياة المهام)                 │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
   ┌────▼────┐   ┌───▼──────┐
   │ReActLoop│   │ToolRouter│
   └────┬────┘   └───┬──────┘
        │            │
   ┌────┴────────────┴────┐
   │                      │
┌──▼──────────┐  ┌───────▼────┐
│VisionNav    │  │MemorySystem│
│+ Stealth    │  │             │
└─────────────┘  └─────────────┘
```

---

## سير العمل المتقدم

### 1. تنفيذ مهمة باستخدام ReAct Loop

```javascript
const task = {
  description: 'سجل الدخول إلى Gmail وأرسل بريد',
  type: 'browser'
};

const loop = new ReActLoop();
const result = await loop.executeTask(task, browser, executor);

// النتيجة تحتوي على:
// - iterations: عدد التكرارات
// - success: هل نجحت المهمة
// - executionHistory: سجل التنفيذ
// - errors: الأخطاء التي حدثت
```

### 2. الملاحة البصرية مع التخفي

```javascript
const navigator = new VisionNavigator(browser);
const stealth = new StealthMode();

// تطبيق التخفي
await stealth.applyStealthToBrowser(context);

// البحث والنقر بشري
const loginBtn = await navigator.robustElementDetection('زر تسجيل الدخول');
if (loginBtn.success) {
  await stealth.humanLikeClick(page, loginBtn.coordinates.x, loginBtn.coordinates.y);
}

// الكتابة البشرية
await stealth.humanLikeType(page, 'my_password');
```

### 3. التعلم من التفاعلات

```javascript
const memory = new MemorySystem();

// تسجيل تفاعل ناجح
memory.recordInteraction({
  type: 'click',
  target: 'login_button',
  description: 'زر تسجيل الدخول',
  success: true,
  duration: 250
});

// تعلم النمط
memory.learnPattern('gmail_login', {
  steps: [
    { action: 'navigate', url: 'https://gmail.com' },
    { action: 'click', element: 'login_button' },
    { action: 'type', field: 'email', text: 'user@gmail.com' },
    { action: 'type', field: 'password', text: 'password' },
    { action: 'click', element: 'submit_button' }
  ]
});

// استخدام النمط لاحقاً
const similarPatterns = memory.getSimilarPatterns('تسجيل الدخول');
```

### 4. معالجة الأخطاء الذكية

```javascript
const loop = new ReActLoop();

// عند حدوث خطأ:
// 1. يسجل الخطأ في الذاكرة
// 2. يحاول استرجاع من الخطأ
// 3. يعيد المحاولة مع استراتيجية مختلفة
// 4. يتعلم من الحل

const result = await loop.executeTask(task, browser, executor);
if (!result.success) {
  console.log('الأخطاء:', result.errors);
  console.log('محاولات الاسترجاع:', result.executionHistory);
}
```

---

## التكامل مع TaskController

تم تحديث `controllers/taskController.js` ليدعم المكونات الجديدة:

```javascript
const ReActLoop = require('../agents/reactLoop');
const VisionNavigator = require('../agents/visionNavigator');
const MemorySystem = require('../agents/memorySystem');
const ToolRouter = require('../agents/toolRouter');

class TaskController {
  constructor() {
    this.reactLoop = new ReActLoop();
    this.memory = new MemorySystem();
    this.toolRouter = new ToolRouter({
      browser: this.browser,
      executor: this.executor
    });
  }

  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    
    // تخزين المهمة في الذاكرة
    this.memory.storeTask(taskId, task);
    
    // تنفيذ باستخدام ReAct Loop
    const result = await this.reactLoop.executeTask(task, this.browser, this.executor);
    
    // تحديث الذاكرة
    this.memory.updateTaskStatus(taskId, result.success ? 'completed' : 'failed', result);
    
    return result;
  }
}
```

---

## أفضل الممارسات

### 1. استخدام ReAct Loop للمهام المعقدة
```javascript
// ✅ صحيح: للمهام التي تحتاج استقلالية
const loop = new ReActLoop({ maxIterations: 10 });
await loop.executeTask(complexTask, browser, executor);

// ❌ خطأ: للمهام البسيطة جداً
```

### 2. تفعيل Stealth Mode على المواقع المحمية
```javascript
// ✅ صحيح: للمواقع التي تكتشف الروبوتات
const stealth = new StealthMode({ enabled: true });
await stealth.applyStealthToBrowser(context);

// ❌ خطأ: تعطيل التخفي على جميع المواقع
```

### 3. استخدام Vision Navigator بدل CSS Selectors
```javascript
// ✅ صحيح: أكثر مرونة وموثوقية
await navigator.clickElement('زر تسجيل الدخول');

// ❌ خطأ: CSS Selectors قد تتغير
await browser.click('button.login-btn');
```

### 4. تعلم الأنماط الناجحة
```javascript
// ✅ صحيح: حفظ الأنماط الناجحة
if (result.success) {
  memory.learnPattern('task_pattern', result.steps);
}

// ❌ خطأ: عدم التعلم من النجاحات
```

---

## الأداء والتحسينات

### معايير الأداء
- **ReAct Loop:** 1-10 ثوان لكل تكرار
- **Vision Navigator:** 500-1500ms لكل بحث عن عنصر
- **Memory System:** < 10ms للوصول للبيانات
- **Stealth Mode:** + 200-500ms لكل تفاعل

### تحسينات مقترحة
1. استخدام Vector DB للذاكرة (Pinecone, Weaviate)
2. تخزين مؤقت للقطات الشاشة
3. معالجة متعددة الخيوط للمهام المتزامنة
4. تحسين كشف العناصر بـ OCR

---

## الاختبار والتصحيح

### اختبار ReAct Loop
```javascript
const testTask = {
  description: 'افتح Google',
  type: 'browser'
};

const loop = new ReActLoop({ maxIterations: 5 });
const result = await loop.executeTask(testTask, browser, executor);

console.log('النتيجة:', result.success);
console.log('التكرارات:', result.iterations);
console.log('الأخطاء:', result.errors);
```

### اختبار Vision Navigator
```javascript
const navigator = new VisionNavigator(browser);

// اختبار البحث
const result = await navigator.findElementByDescription('زر البحث');
console.log('العنصر:', result.element);
console.log('الإحداثيات:', result.coordinates);
console.log('الثقة:', result.confidence);
```

### اختبار Memory System
```javascript
const memory = new MemorySystem();

// اختبار التخزين
memory.storeTask('task1', { description: 'اختبار' });
memory.recordInteraction({ type: 'click', success: true });
memory.learnPattern('test', { steps: [] });

// اختبار الإحصائيات
console.log(memory.getStatistics());
```

---

## الخطوات التالية

1. **دمج LangGraph:** للتخطيط الأكثر تقدماً
2. **إضافة Vector Memory:** للذاكرة الدلالية
3. **تحسين Vision API:** دعم صور أفضل
4. **إضافة Multi-Agent Orchestration:** تنسيق أفضل بين الوكلاء
5. **تحسين Error Recovery:** استراتيجيات استرجاع أكثر ذكاءً

---

## المراجع والموارد

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Playwright Documentation](https://playwright.dev/)
- [DeepSeek API](https://api.deepseek.com/)
- [Set-of-Mark Prompting](https://som-gpt4v.github.io/)

---

**آخر تحديث:** مارس 2026
