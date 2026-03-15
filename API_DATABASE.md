# Database & Models Setup

## Database (SQLite)

### Location
- **Local**: `data/app.db`
- **Cloud**: `/app/data/app.db` (configured in Dockerfile)

### Tables
```sql
- tasks: تخزين المهام والنتائج
- agent_states: حالة الوكلاء (LangGraph, Open Interpreter, AutoGPT)
- browser_sessions: جلسات المتصفح
- model_metadata: بيانات النماذج المتاحة
- execution_logs: سجل تنفيذ العمليات
```

### Initialize Database
```bash
# محليا
npm run init-db

# سيتم التهيئة تلقائياً عند بدء الخادم
```

---

## AI Models (Llama 2, Mistral, Qwen)

### Models المدعومة
1. **Llama 2 7B** (3.8 GB)
   - URL: huggingface.co/TheBloke/Llama-2-7B-GGUF
   - Type: llama
   
2. **Mistral 7B** (4.4 GB)
   - URL: huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF
   - Type: mistral
   
3. **Qwen 7B** (4.3 GB)
   - URL: huggingface.co/TheBloke/Qwen-7B-GGUF
   - Type: qwen

### تحميل النماذج

#### محلياً
```bash
USE_LOCAL_MODELS=true npm run download-models
```

#### على السحابة (Cloud Deployment)
تعيين المتغير البيئي:
```
USE_LOCAL_MODELS=true
```

المكتبة ستحمل النماذج تلقائياً عند البدء الأول.

### النماذج المُنشأة مسبقاً
إذا كانت النماذج محدودة في السحابة:
- استخدم **Ollama API** (بدل التحميل المحلي)
- أو استخدم **DeepSeek API** (cloud)
- أو استخدم **Gemini API** (free tier)

---

## Integration بـ Integrations

### Database في LangGraph
```javascript
// تسجيل تنفيذ في قاعدة البيانات
await database.recordExecution({
  id: uuidv4(),
  task_id: taskId,
  agent_type: 'langgraph',
  action: 'think',
  input: userMessage,
  output: agentThought,
  duration_ms: executionTime
});
```

### Database في Open Interpreter
```javascript
// تسجيل أوامر التنفيذ
await database.recordExecution({
  id: uuidv4(),
  agent_type: 'open_interpreter',
  action: 'bash_execute',
  input: command,
  output: output,
  duration_ms: time
});
```

### Database في AutoGPT
```javascript
// تسجيل blocks المنفذة
await database.recordExecution({
  id: uuidv4(),
  agent_type: 'autogpt',
  action: 'block_execute',
  input: block.type,
  output: result,
  duration_ms: time
});
```

---

## Environment Variables

```bash
# Database
DB_PATH=/app/data/app.db

# Models
USE_LOCAL_MODELS=false  # true يحمل نماذج محلية
OLLAMA_MODEL=llama2

# API Providers
DEEPSEEK_API_KEY=xxx
GEMINI_API_KEY=xxx
GITHUB_TOKEN=xxx
```

---

## Health Check

```bash
curl http://localhost:5000/health
```

Response:
```json
{
  "status": "ok",
  "database": "connected",
  "models": {
    "available": 0,
    "total": 3
  },
  "timestamp": "2026-03-15T10:00:00Z"
}
```
