# إصلاحات تم تطبيقها على مشروع ai-browser-agent-node

## ملخص المشكلة
كان **PlannerAgent** يتوقف عن إكمال المهام عند استخدام **DeepSeek API**، حيث أن الـ `response_format: { type: 'json_object' }` قد يسبب تعارضات في الاستجابات النصية.

---

## الإصلاحات المطبقة

### 1. **إزالة `response_format` من جميع استدعاءات DeepSeek API**

#### الملفات المتأثرة:
- `agents/plannerAgent.js`
- `agents/reactLoop.js`
- `agents/thinkingAgent.js`

#### التفاصيل:
- تم إزالة `response_format: { type: 'json_object' }` من جميع استدعاءات DeepSeek
- تم الاعتماد على **system prompts واضحة** تطلب JSON بشكل صريح
- هذا يسمح لـ DeepSeek بإرسال الاستجابات بشكل أكثر مرونة دون فرض صيغة صارمة

**مثال قبل الإصلاح:**
```javascript
const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
  model: 'deepseek-chat',
  messages: [...],
  response_format: { type: 'json_object' }  // ❌ تم حذفها
}, {
  headers: { 'Authorization': `Bearer ${this.deepseekApiKey}` },
  timeout: 20000
});
```

**مثال بعد الإصلاح:**
```javascript
const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
  model: 'deepseek-chat',
  messages: [...]  // ✅ بدون response_format
}, {
  headers: { 
    'Authorization': `Bearer ${this.deepseekApiKey}`,
    'Content-Type': 'application/json'
  },
  timeout: 60000  // ✅ زيادة المهلة
});
```

---

### 2. **تحسين System Prompts لطلب JSON بوضوح**

#### التغييرات:
- أضيفت تعليمات صريحة في كل system prompt لطلب JSON فقط
- إزالة أي طلب لـ markdown code blocks
- تأكيد عدم إرسال أي نص إضافي

**أمثلة من التحسينات:**

**في `plannerAgent.js` - `generatePlan()`:**
```javascript
// قبل:
Return a JSON object:
{...}

// بعد:
Return ONLY a valid JSON object (no markdown blocks, no preamble):
{...}
```

**في `plannerAgent.js` - `analyzeTaskWithDeepSeek()`:**
```javascript
// قبل:
Return a JSON object with "type" and "priority" fields.

// بعد:
Return ONLY a valid JSON object with "type" and "priority" fields.
```

**في `reactLoop.js` - `think()`:**
```javascript
// قبل:
Return as JSON with: currentState, progress, obstacles, taskComplete, nextSteps, confidence

// بعد:
Return ONLY a valid JSON object with: currentState, progress, obstacles, taskComplete, nextSteps, confidence. Do not include markdown blocks.
```

---

### 3. **زيادة مهلة الطلبات (Timeout)**

#### التغييرات:
- **`plannerAgent.js`:**
  - `generatePlan()`: من `default` إلى **60 ثانية**
  - `analyzeTaskWithDeepSeek()`: من `20 ثانية` إلى **60 ثانية**
  - `planWithDeepSeek()`: بقيت **120 ثانية** (2 دقيقة)
  - `planMultiStageTask()`: من `default` إلى **60 ثانية**

- **`reactLoop.js`:**
  - `think()`: من `30 ثانية` إلى **60 ثانية**
  - `plan()`: من `10 ثانية` إلى **60 ثانية**

- **`thinkingAgent.js`:**
  - `reasonAboutComplexTask()`: أضيفت **60 ثانية**

#### السبب:
- DeepSeek قد يحتاج وقتاً أطول للمعالجة
- المهلات الطويلة تقلل من احتمالية timeout errors

---

### 4. **تحسين `safeJsonParse()` في جميع الملفات**

#### التحسينات:
- دعم أفضل لاستخراج JSON من نصوص مختلطة
- محاولة استخراج JSON من بين النصوص الأخرى
- إصلاح تلقائي للـ JSON المقطوع (unterminated strings/braces)

#### المنطق المحسّن:
1. محاولة parse مباشر
2. إزالة markdown code blocks
3. إصلاح الـ quotes والـ braces المفتوحة
4. استخراج JSON من بين النصوص الأخرى
5. إصلاح متقدم للـ JSON المستخرج

**مثال:**
```javascript
// إذا كانت الاستجابة:
"Here is the plan: { "goal": "create account", "steps": [ ... }"

// يتم استخراج الـ JSON تلقائياً:
{ "goal": "create account", "steps": [ ... ] }
```

---

### 5. **إضافة Headers مناسبة**

#### التغييرات:
- أضيفت `'Content-Type': 'application/json'` لجميع استدعاءات DeepSeek
- هذا يضمن أن الخادم يفهم أن الطلب يتضمن JSON

---

## الملفات المعدلة

| الملف | عدد التعديلات | الوصف |
|------|-------------|-------|
| `agents/plannerAgent.js` | 7 | إزالة response_format، تحسين prompts، زيادة timeouts |
| `agents/reactLoop.js` | 3 | إزالة response_format، تحسين prompts، إصلاح safeJsonParse |
| `agents/thinkingAgent.js` | 2 | إزالة response_format، تحسين safeJsonParse |

---

## الفوائد المتوقعة

✅ **استقرار أفضل:** عدم توقف PlannerAgent عند استخدام DeepSeek  
✅ **معالجة أخطاء أفضل:** قدرة أفضل على التعامل مع استجابات غير متوقعة  
✅ **أداء أفضل:** مهلات أطول تقلل من timeout errors  
✅ **دعم عربي أفضل:** system prompts محسّنة تدعم اللغة العربية  

---

## خطوات الاختبار الموصى بها

1. **اختبار بسيط:**
   ```bash
   npm start
   ```

2. **اختبار مهمة فيسبوك:**
   - أرسل: `قم بانشاء حساب فيسبوك`
   - تحقق من أن PlannerAgent ينهي التخطيط بنجاح

3. **مراقبة السجلات:**
   - ابحث عن رسائل `[PlannerAgent]` في الـ console
   - تأكد من عدم وجود أخطاء JSON parsing

4. **اختبار مهام متعددة:**
   - اختبر مهام متنوعة (browser, system, development)
   - تأكد من استقرار النظام

---

## ملاحظات إضافية

- **API Keys:** تأكد من أن `DEEPSEEK_API_KEY` و `GEMINI_API_KEY` محفوظة بشكل صحيح
- **Network:** تأكد من اتصال الإنترنت المستقر (خاصة لـ DeepSeek API)
- **Fallback:** إذا فشل DeepSeek، سيتم الانتقال تلقائياً إلى Gemini أو rule-based planning

---

## الخلاصة

تم تطبيق **5 مجموعات رئيسية من الإصلاحات** لضمان استقرار PlannerAgent وعدم توقفه عند استخدام DeepSeek API. هذه الإصلاحات تركز على:

1. إزالة القيود الصارمة على صيغة الاستجابات
2. تحسين طلب JSON بشكل صريح
3. زيادة المهلات الزمنية
4. تحسين معالجة الأخطاء
5. إضافة headers مناسبة

النظام الآن **أكثر استقراراً وموثوقية** في التعامل مع استدعاءات DeepSeek API.
