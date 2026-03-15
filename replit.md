# AI Browser Agent Platform

**تاريخ التحديث:** 2026-03-15

## الوضع الحالي
- ✅ محلي: يعمل بنجاح على http://0.0.0.0:5000
- ✅ Browser: Chromium جاهز والتصفح يعمل
- ✅ Integrations: LangGraph, Open Interpreter, AutoGPT (كل واحد له engine خاص)
- ⏳ النشر: جاري الانتقال من Render → Railway (أسرع + أقل timeout)

## البنية الحالية

### المكاملات:
1. **LangGraphIntegration** - StateGraph, Channels, ReAct agents
2. **OpenInterpreterIntegration** - BashTool, EditTool, JavaScriptTool, PythonTool
3. **AutoGPTIntegration** - Block/BlockType, AgentGraph, Think→Plan→Act→Observe loop

### المحركات:
- OllamaIntegration (local fallback)
- LlamaIntegration (llama-2-7b.gguf)
- MistralIntegration (mistral-7b-v0.1.gguf)
- QwenIntegration (qwen-7b.gguf)

### الـ API:
- POST `/api/tasks/execute` - تنفيذ مهمة
- GET `/api/agents/state` - الحالة الحالية
- WS `/socket.io/` - real-time streaming

## الملفات الرئيسية
- `server.ts` - Express + Socket.io
- `agents/langgraphIntegration.js`
- `agents/openInterpreterIntegration.js`
- `agents/autogptIntegration.js`
- `agents/integrationsManager.js`
- `controllers/taskController.js`

## متغيرات البيئة
```
DEEPSEEK_API_KEY=xxx (API DeepSeek - اختياري)
GEMINI_API_KEY=xxx (API Gemini - اختياري)
GITHUB_TOKEN=xxx (GitHub PAT)
PORT=5000 (محلي) / 10000 (Render) / 8080 (Railway)
NODE_ENV=production (في السحابة)
USE_LOCAL_MODELS=false (عدم تحميل نماذج محلية)
```

## خطوات النشر على Railway

### 1. إنشء حساب Railway
```bash
railway login
```

### 2. ربط المشروع
```bash
railway link
```

### 3. النشر
```bash
railway up
```

### 4. الـ URL الحية
```
https://ai-browser-agent-node.railway.app (أو domain مخصص)
```

## ملاحظات مهمة
- النماذج المحلية معطلة على السحابة (استخدم API بدلاً منها)
- Browser init الآن غير blocking (timeout = 30 ثانية)
- Health check: `/health`
- Render deprecated - استخدم Railway الآن
