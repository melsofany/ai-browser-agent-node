# دليل التكاملات المدمجة (Integrations Guide)

## نظرة عامة

تم دمج ستة منصات ذكاء اصطناعي رئيسية في مشروع `ai-browser-agent-node`:

1. **Llama** (Meta-Llama) - نماذج لغة مفتوحة المصدر
2. **Mistral** - نماذج لغة عالية الأداء
3. **Qwen** (Alibaba) - نماذج لغة صينية متقدمة
4. **Open Interpreter** - تنفيذ الأكواد والأوامر
5. **AutoGPT** - وكيل مستقل ذكي
6. **LangGraph** - بناء سير العمل المعقدة

## البنية الهندسية

```
ai-browser-agent-node/
├── agents/
│   ├── llamaIntegration.js          # تكامل Llama
│   ├── mistralIntegration.js        # تكامل Mistral
│   ├── qwenIntegration.js           # تكامل Qwen
│   ├── openInterpreterIntegration.js # تكامل Open Interpreter
│   ├── autogptIntegration.js        # تكامل AutoGPT
│   ├── langgraphIntegration.js      # تكامل LangGraph
│   └── integrationsManager.js       # مدير التكاملات الموحد
├── integrations/
│   ├── llama/                       # ملفات Llama Stack
│   ├── mistral/                     # ملفات Mistral
│   ├── qwen/                        # ملفات Qwen
│   ├── open-interpreter/            # ملفات Open Interpreter
│   ├── autogpt/                     # ملفات AutoGPT
│   └── langgraph/                   # ملفات LangGraph
└── ...
```

## الاستخدام الأساسي

### 1. تهيئة مدير التكاملات

```javascript
const IntegrationsManager = require('./agents/integrationsManager');

const manager = new IntegrationsManager({
  activeProvider: 'llama', // الموفر النشط الافتراضي
  fallbackProviders: ['mistral', 'qwen'], // الموفرون البديلون
  llama: {
    modelName: 'llama-2-7b',
    temperature: 0.7
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    modelName: 'mistral-7b'
  },
  qwen: {
    apiKey: process.env.QWEN_API_KEY,
    modelName: 'qwen-7b'
  }
});

await manager.initialize();
```

### 2. توليد النصوص

```javascript
// استخدام الموفر النشط
const result = await manager.generateText(
  'اكتب قصة قصيرة عن الذكاء الاصطناعي',
  {
    maxTokens: 500,
    temperature: 0.7
  }
);

console.log(result.text);
console.log(`Provider: ${result.provider}`);
```

### 3. محادثة ذكية

```javascript
const messages = [
  { role: 'system', content: 'أنت مساعد ذكي مفيد' },
  { role: 'user', content: 'ما هو الذكاء الاصطناعي؟' }
];

const response = await manager.chat(messages, {
  temperature: 0.5,
  maxTokens: 1024
});

console.log(response.response);
```

### 4. تحليل المهام

```javascript
const taskAnalysis = await manager.analyzeTask(
  'أريد بناء تطبيق ويب يتنبأ بأسعار الأسهم'
);

console.log(taskAnalysis);
// {
//   taskType: 'application_development',
//   complexity: 'complex',
//   steps: [...],
//   risks: [...],
//   recommendations: [...]
// }
```

### 5. توليد الأكواد

```javascript
const codeResult = await manager.generateCode(
  'دالة JavaScript تحسب مجموع الأرقام في مصفوفة',
  'javascript'
);

console.log(codeResult.code);
```

### 6. تنفيذ الأكواد (Open Interpreter)

```javascript
// تنفيذ JavaScript
const jsResult = await manager.executeCode(
  'console.log(2 + 2)',
  'javascript'
);

// تنفيذ Python
const pyResult = await manager.executeCode(
  'print("Hello from Python")',
  'python'
);

// تنفيذ Bash
const bashResult = await manager.executeCode(
  'ls -la',
  'bash'
);
```

### 7. تفسير التعليمات الطبيعية

```javascript
const interpretation = await manager.interpretInstruction(
  'أنشئ ملف يحتوي على أسماء 10 أشخاص عشوائيين',
  {}
);

console.log(interpretation.generated); // الكود المولد
console.log(interpretation.execution); // نتيجة التنفيذ
```

### 8. المهام المستقلة (AutoGPT)

```javascript
const autonomousTask = await manager.executeAutonomousTask(
  'ابحث عن أحدث أخبار الذكاء الاصطناعي وقدم ملخصاً',
  {
    context: { maxIterations: 5 }
  }
);

console.log(autonomousTask);
// {
//   taskId: 'task_...',
//   goal: '...',
//   iterations: [...],
//   status: 'completed',
//   result: {...}
// }
```

### 9. بناء سير العمل (LangGraph)

```javascript
// إنشاء عقد سير العمل
const nodes = [
  {
    id: 'start',
    type: 'action',
    handler: async (state) => {
      return { message: 'بدء سير العمل' };
    }
  },
  {
    id: 'process',
    type: 'action',
    handler: async (state) => {
      return { processed: true };
    }
  },
  {
    id: 'end',
    type: 'action',
    handler: async (state) => {
      return { complete: true };
    }
  }
];

// إنشاء الحواف
const edges = [
  { from: 'start', to: 'process' },
  { from: 'process', to: 'end' }
];

// تنفيذ سير العمل
const workflow = await manager.createAndExecuteWorkflow(
  'my-workflow',
  nodes,
  edges,
  { initialData: 'test' }
);

console.log(workflow);
```

## متغيرات البيئة المطلوبة

أضف المتغيرات التالية في ملف `.env`:

```bash
# OpenAI API (مطلوب لـ AutoGPT و Open Interpreter)
OPENAI_API_KEY=sk-...

# Mistral API
MISTRAL_API_KEY=...

# Qwen API
QWEN_API_KEY=...

# Llama (اختياري - للنماذج المحلية)
LLAMA_API_KEY=...

# DeepSeek (موجود بالفعل)
DEEPSEEK_API_KEY=...
```

## الميزات المتقدمة

### تبديل الموفرين

```javascript
// تغيير الموفر النشط
manager.setActiveProvider('mistral');

// الحصول على الموفر النشط
const activeProvider = manager.getActiveProvider();

// الحصول على قائمة الموفرين المتاحين
const providers = manager.getAvailableProviders();
// ['llama', 'mistral', 'qwen', 'open-interpreter', 'autogpt', 'langgraph']
```

### فحص الصحة

```javascript
const health = await manager.healthCheck();
console.log(health);
// {
//   timestamp: Date,
//   integrations: {
//     llama: { status: 'healthy', initialized: true },
//     mistral: { status: 'healthy', initialized: true },
//     ...
//   }
// }
```

### الحصول على القدرات

```javascript
// قدرات موفر واحد
const capabilities = manager.getProviderCapabilities('llama');
// {
//   name: 'llama',
//   methods: ['generateText', 'chat', 'analyzeTask', 'generateCode']
// }

// جميع القدرات
const allCapabilities = manager.getAllCapabilities();
```

## معالجة الأخطاء

```javascript
try {
  const result = await manager.generateText('Hello');
} catch (error) {
  console.error('Error:', error.message);
  
  // سيحاول تلقائياً استخدام الموفرين البديلين
  // إذا فشلوا جميعاً، سيرمي خطأ
}
```

## الأداء والتحسينات

### التخزين المؤقت

```javascript
// يمكن إضافة طبقة تخزين مؤقت للنتائج المتكررة
const cacheKey = `${prompt}_${options.temperature}`;
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

### المعالجة المتوازية

```javascript
// تنفيذ عدة طلبات بالتوازي
const results = await Promise.all([
  manager.generateText('prompt1'),
  manager.generateText('prompt2'),
  manager.generateText('prompt3')
]);
```

## الأمان

### التحقق من سلامة الأكواس

```javascript
const interpreter = manager.getIntegration('open-interpreter');

const safety = interpreter.validateCodeSafety(code, 'bash');
if (!safety.safe) {
  console.warn(`Unsafe code detected: ${safety.reason}`);
}
```

### وضع الحماية (Sandbox Mode)

```javascript
const interpreter = new OpenInterpreterIntegration({
  sandboxMode: true, // تفعيل وضع الحماية
  allowedLanguages: ['javascript', 'python'] // تقييد اللغات المسموحة
});
```

## النشر على Render

### ملف render.yaml

```yaml
services:
  - type: web
    name: ai-browser-agent
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: MISTRAL_API_KEY
        sync: false
      - key: QWEN_API_KEY
        sync: false
      - key: DEEPSEEK_API_KEY
        sync: false
```

### خطوات النشر

1. ادفع المشروع إلى GitHub
2. انتقل إلى https://render.com
3. أنشئ خدمة ويب جديدة
4. اختر المستودع
5. أضف متغيرات البيئة
6. انقر على "Deploy"

## استكشاف الأخطاء

### المشكلة: "API key not configured"

**الحل:** تأكد من إضافة المفاتيح في ملف `.env` أو متغيرات البيئة.

### المشكلة: "All providers failed"

**الحل:** تحقق من الاتصال بالإنترنت وتأكد من صحة المفاتيح.

### المشكلة: "Timeout error"

**الحل:** زيادة `executionTimeout` في الإعدادات أو استخدام موفر بديل أسرع.

## الموارد الإضافية

- [Llama Documentation](https://github.com/meta-llama/llama-stack)
- [Mistral Documentation](https://docs.mistral.ai/)
- [Qwen Documentation](https://github.com/QwenLM/Qwen)
- [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter)
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
- [LangGraph](https://github.com/langchain-ai/langgraph)

## الترخيص

هذا المشروع مرخص تحت ISC License.
