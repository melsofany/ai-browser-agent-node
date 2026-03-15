import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Send, Bot, User, Brain, Info, CheckCircle2, XCircle,
  Loader2, RefreshCw, History, Monitor, ChevronRight,
  Settings, Terminal, AlertTriangle, X, Check, Globe,
  Eye, Zap, Play, ChevronLeft, Layers, Clock, Activity,
  Maximize2, ArrowLeft, ArrowRight, RotateCcw, Home,
  Keyboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  type: 'user' | 'agent' | 'thinking' | 'system';
  text: string;
  timestamp: Date;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'info' | 'warning' | 'awaiting_user';
  level?: 'info' | 'error' | 'warning' | 'success';
  step?: string;
  data?: any;
}

interface Task {
  taskId: string;
  description: string;
  status: string;
  createdAt: string;
}

type ActiveTab = 'chat' | 'browser';

const STEP_META: Record<string, { icon: React.FC<any>; color: string; label: string }> = {
  OBSERVE:  { icon: Eye,         color: 'text-blue-400',    label: 'مراقبة' },
  THINK:    { icon: Brain,       color: 'text-violet-400',  label: 'تفكير' },
  PLAN:     { icon: Layers,      color: 'text-indigo-400',  label: 'تخطيط' },
  ACT:      { icon: Zap,         color: 'text-amber-400',   label: 'تنفيذ' },
  VERIFY:   { icon: CheckCircle2,color: 'text-emerald-400', label: 'تحقق'  },
  MEMORY:   { icon: Clock,       color: 'text-pink-400',    label: 'ذاكرة' },
  PLANNING: { icon: Activity,    color: 'text-cyan-400',    label: 'وضع خطة'},
};

const App: React.FC = () => {
  const [messages, setMessages]               = useState<Message[]>([]);
  const [inputValue, setInputValue]           = useState('');
  const [isConnected, setIsConnected]         = useState(false);
  const [tasks, setTasks]                     = useState<Task[]>([]);
  const [browserHasFrame, setBrowserHasFrame] = useState(false);
  const [currentStep, setCurrentStep]         = useState<string | null>(null);
  const [activeTab, setActiveTab]             = useState<ActiveTab>('chat');
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [showKeyboard, setShowKeyboard]       = useState(false);
  const [keyboardText, setKeyboardText]       = useState('');
  const [urlBarValue, setUrlBarValue]         = useState('');
  const [isAgentBusy, setIsAgentBusy]         = useState(false);

  const socketRef      = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const browserImgRef  = useRef<HTMLImageElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const lastTouchRef   = useRef<{ x: number; y: number; time: number } | null>(null);

  // ─── Touch → Browser events ──────────────────────────────────────────────
  const getBrowserCoords = useCallback((clientX: number, clientY: number) => {
    const img = browserImgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    return {
      x: Math.round(((clientX - rect.left) / rect.width)  * 1280),
      y: Math.round(((clientY - rect.top)  / rect.height) * 720),
    };
  }, []);

  const emitBrowser = useCallback((type: string, params: any) => {
    socketRef.current?.emit('browserEvent', { type, pageId: 'default', params });
  }, []);

  // Touch handlers – converts finger touch to remote browser click/scroll
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const last  = lastTouchRef.current;
    if (!last) return;

    const dx   = touch.clientX - last.x;
    const dy   = touch.clientY - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt   = Date.now() - last.time;

    if (dist < 10 && dt < 300) {
      // Single tap → click
      const coords = getBrowserCoords(touch.clientX, touch.clientY);
      emitBrowser('click', { ...coords, button: 'left' });
    }
    lastTouchRef.current = null;
  }, [getBrowserCoords, emitBrowser]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && lastTouchRef.current) {
      const touch = e.touches[0];
      const deltaY = lastTouchRef.current.y - touch.clientY;
      if (Math.abs(deltaY) > 5) {
        emitBrowser('scroll', { deltaX: 0, deltaY: deltaY * 2 });
        lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    }
  }, [emitBrowser]);

  // Mouse interaction (desktop)
  const handleMouseInteraction = useCallback((e: React.MouseEvent | React.KeyboardEvent | React.WheelEvent) => {
    const type = e.type;
    let params: any = {};
    if ('clientX' in e) {
      const coords = getBrowserCoords((e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
      params = { ...coords, button: (e as React.MouseEvent).button === 2 ? 'right' : 'left' };
    } else if (type === 'wheel') {
      params = { deltaX: (e as React.WheelEvent).deltaX, deltaY: (e as React.WheelEvent).deltaY };
    } else if ('key' in e) {
      params = { key: (e as React.KeyboardEvent).key };
    }
    emitBrowser(type, params);
  }, [getBrowserCoords, emitBrowser]);

  // ─── Socket.io ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      addSystem('متصل بالخادم بنجاح', 'success');
      socket.emit('getStatus');
    });
    socket.on('disconnect', () => {
      setIsConnected(false);
      addSystem('انقطع الاتصال بالخادم', 'error');
    });
    socket.on('status', (d: { tasks: Task[] }) => setTasks(d.tasks || []));

    socket.on('taskUpdate', (d: any) => {
      socket.emit('getStatus');
      if (d.type === 'status_change') {
        if (d.status === 'completed') { addAgent('اكتملت المهمة بنجاح', 'completed'); setIsAgentBusy(false); }
        else if (d.status === 'failed') { addAgent(`فشلت المهمة: ${d.error}`, 'failed'); setIsAgentBusy(false); }
        else if (d.status === 'awaiting_user') addAgent('الوكيل ينتظر تدخلك', 'awaiting_user');
      }
    });

    socket.on('taskStart', (d: any) => {
      addSystem(`بدأت المهمة: ${d.description}`, 'info');
      setIsAgentBusy(true);
      setActiveTab('browser');
    });
    socket.on('taskSuccess', () => setIsAgentBusy(false));
    socket.on('taskFail',    () => setIsAgentBusy(false));

    socket.on('thinking', (d: { content: string }) => {
      const text = d.content;
      const match = text.match(/^\[(\w+)\]/);
      if (match) setCurrentStep(match[1]);
      addThinking(text, match?.[1]);
    });

    socket.on('browserStream', (d: { image: string }) => {
      if (d.image && browserImgRef.current) {
        browserImgRef.current.src = `data:image/jpeg;base64,${d.image}`;
        setBrowserHasFrame(prev => prev || true);
      }
    });

    socket.on('log', (log: { level: string; message: string }) => {
      if (log.level === 'error') addSystem(log.message, 'error');
    });

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Message helpers ──────────────────────────────────────────────────────
  const addSystem = (text: string, level: Message['level'] = 'info') =>
    setMessages(p => [...p, { id: uid(), type: 'system', text, timestamp: new Date(), level }]);

  const addAgent = (text: string, status: Message['status'] = 'completed', data?: any) =>
    setMessages(p => {
      const last = p[p.length - 1];
      if (last?.type === 'agent' && last.text === text && last.status === status) return p;
      return [...p, { id: uid(), type: 'agent', text, timestamp: new Date(), status, data }];
    });

  const addThinking = (text: string, step?: string) =>
    setMessages(p => {
      const last = p[p.length - 1];
      if (last?.type === 'thinking' && last.step === step)
        return [...p.slice(0, -1), { ...last, text: last.text + '\n' + text }];
      return [...p, { id: uid(), type: 'thinking', text, timestamp: new Date(), step }];
    });

  const uid = () => Math.random().toString(36).substr(2, 9);

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputValue.trim();
    if (!text || !socketRef.current || !isConnected) return;
    setMessages(p => [...p, { id: uid(), type: 'user', text, timestamp: new Date() }]);
    socketRef.current.emit('submitTask', { description: text, type: 'browser', priority: 'normal' });
    setInputValue('');
  };

  // Keyboard overlay send
  const handleKeyboardSend = () => {
    if (!keyboardText.trim()) return;
    emitBrowser('type_text', { text: keyboardText });
    setKeyboardText('');
    setShowKeyboard(false);
  };

  // ─── Render step badge ────────────────────────────────────────────────────
  const StepBadge = ({ step }: { step?: string }) => {
    if (!step || !STEP_META[step]) return null;
    const { icon: Icon, color, label } = STEP_META[step];
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${color} mb-1`}>
        <Icon size={10} /> {label}
      </span>
    );
  };

  // ─── Render single message ────────────────────────────────────────────────
  const renderMessage = (msg: Message) => {
    if (msg.type === 'system') {
      const colors: Record<string, string> = {
        error:   'bg-red-500/10 border-red-500/20 text-red-400',
        warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
        success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        info:    'bg-slate-800/40 border-slate-700/30 text-slate-500',
      };
      return (
        <div key={msg.id} className="flex justify-center my-2 px-4">
          <div className={`px-3 py-1 rounded-full text-[11px] flex items-center gap-1.5 border ${colors[msg.level || 'info']}`}>
            {msg.level === 'success' ? <Check size={11} /> : <Info size={11} />}
            {msg.text}
          </div>
        </div>
      );
    }

    const isUser     = msg.type === 'user';
    const isThinking = msg.type === 'thinking';

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 px-4`}
      >
        {!isUser && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 ${
            isThinking ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-indigo-500/20 border border-indigo-500/30'
          }`}>
            {isThinking ? <Brain size={15} className="text-violet-400" /> : <Bot size={15} className="text-indigo-400" />}
          </div>
        )}

        <div className={`flex flex-col max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
          {isThinking && <StepBadge step={msg.step} />}
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-tr-none'
              : isThinking
                ? 'bg-[#1a1a24] border border-slate-700/50 text-slate-400 italic text-xs rounded-tl-none'
                : 'bg-[#1c1c28] border border-slate-700/40 text-slate-200 rounded-tl-none'
          }`}>
            {isThinking && (
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-slate-600 font-semibold uppercase">
                <Loader2 size={9} className="animate-spin" /> يفكر الوكيل...
              </div>
            )}
            <div className="whitespace-pre-wrap">{msg.text}</div>
            {msg.status === 'running' && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-400">
                <Loader2 size={11} className="animate-spin" /> جارٍ التنفيذ...
              </div>
            )}
            {msg.status === 'awaiting_user' && (
              <button
                onClick={() => {
                  const last = tasks[tasks.length - 1];
                  if (last) socketRef.current?.emit('resumeTask', last.taskId);
                }}
                className="mt-3 px-4 py-2 bg-orange-600/80 hover:bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Play size={12} /> استئناف المهمة
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-600 mt-1 px-1">
            {new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {isUser && (
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 ml-3 mt-0.5">
            <User size={15} className="text-slate-300" />
          </div>
        )}
      </motion.div>
    );
  };

  // ─── Browser Panel ────────────────────────────────────────────────────────
  const BrowserPanel = () => (
    <div className="flex flex-col h-full bg-[#0e0e16]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#12121c] border-b border-slate-800/60">
        <button
          onClick={() => emitBrowser('go_back', {})}
          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-all touch-manipulation"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          onClick={() => emitBrowser('go_forward', {})}
          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-all touch-manipulation"
        >
          <ArrowRight size={16} />
        </button>
        <button
          onClick={() => emitBrowser('reload', {})}
          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-all touch-manipulation"
        >
          <RotateCcw size={15} />
        </button>

        {/* URL bar */}
        <form
          onSubmit={e => {
            e.preventDefault();
            let url = urlBarValue.trim();
            if (!url.startsWith('http')) url = 'https://' + url;
            emitBrowser('navigate', { url });
          }}
          className="flex-1 flex items-center gap-2 bg-slate-900/60 border border-slate-700/40 rounded-xl px-3 py-1.5"
        >
          <Globe size={13} className="text-slate-500 flex-shrink-0" />
          <input
            value={urlBarValue}
            onChange={e => setUrlBarValue(e.target.value)}
            placeholder="أدخل الرابط..."
            className="bg-transparent outline-none text-xs text-slate-300 w-full placeholder-slate-600"
          />
        </form>

        {/* Touch keyboard button */}
        <button
          onClick={() => setShowKeyboard(v => !v)}
          className={`p-2 rounded-lg transition-all touch-manipulation ${
            showKeyboard ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'
          }`}
          title="لوحة مفاتيح"
        >
          <Keyboard size={16} />
        </button>
      </div>

      {/* Touch keyboard panel */}
      <AnimatePresence>
        {showKeyboard && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-slate-800/60 bg-[#12121c] overflow-hidden"
          >
            <div className="p-3 flex gap-2">
              <input
                autoFocus
                value={keyboardText}
                onChange={e => setKeyboardText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleKeyboardSend(); }}
                placeholder="اكتب نصاً للإرسال للمتصفح..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleKeyboardSend}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all touch-manipulation"
              >
                إرسال
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live stream canvas */}
      <div
        className="flex-1 relative bg-black select-none overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleMouseInteraction as any}
        onKeyDown={handleMouseInteraction as any}
        onKeyUp={handleMouseInteraction as any}
        tabIndex={0}
      >
        {/* Loading spinner */}
        {!browserHasFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-4 z-10">
            <div className="w-14 h-14 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
            <p className="text-sm font-medium text-slate-600">جاري تهيئة المتصفح...</p>
          </div>
        )}

        {/* Browser screenshot */}
        <img
          ref={browserImgRef}
          alt="Browser View"
          draggable={false}
          className="w-full h-full object-contain"
          style={{ display: browserHasFrame ? 'block' : 'none', touchAction: 'none' }}
          onClick={handleMouseInteraction as any}
          onDoubleClick={handleMouseInteraction as any}
          onMouseDown={handleMouseInteraction as any}
          onMouseUp={handleMouseInteraction as any}
          onContextMenu={e => { e.preventDefault(); handleMouseInteraction(e as any); }}
        />

        {/* Status pill */}
        {isAgentBusy && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2 text-xs text-indigo-300 font-medium">
            <Loader2 size={12} className="animate-spin" />
            الوكيل يتحكم في المتصفح
          </div>
        )}

        {/* Tap hint */}
        {browserHasFrame && !isAgentBusy && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full text-[11px] text-slate-500 flex items-center gap-2">
            <Terminal size={11} /> اضغط للنقر • اسحب للتمرير
          </div>
        )}
      </div>
    </div>
  );

  // ─── Chat Panel ───────────────────────────────────────────────────────────
  const ChatPanel = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-4 scroll-smooth" style={{ overscrollBehavior: 'contain' }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-600/30 to-violet-600/30 border border-indigo-500/20 flex items-center justify-center mb-6">
              <Bot size={36} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">كيف يمكنني مساعدتك؟</h2>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-10">
              يمكنني تصفح الإنترنت، إنشاء الحسابات، والبحث عن المعلومات تلقائياً
            </p>
            <div className="grid grid-cols-1 gap-3 w-full max-w-sm">
              {[
                "ابحث عن آخر أخبار الذكاء الاصطناعي",
                "افتح موقع الجزيرة وأظهر آخر الأخبار",
                "ابحث عن أفضل مطاعم في الرياض",
                "اذهب إلى يوتيوب وشغّل أغنية هادئة",
              ].map((s, i) => (
                <button
                  key={i}
                  onClick={() => setInputValue(s)}
                  className="p-4 bg-slate-800/40 border border-slate-700/40 rounded-2xl text-right text-sm text-slate-400 hover:text-slate-200 hover:border-indigo-500/30 hover:bg-slate-800/70 transition-all active:scale-95 touch-manipulation"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800/50 bg-[#0d0d15]">
        {/* Current step indicator */}
        {isAgentBusy && currentStep && STEP_META[currentStep] && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-xl border border-slate-700/30">
            {React.createElement(STEP_META[currentStep].icon, { size: 14, className: STEP_META[currentStep].color })}
            <span className={`text-xs font-semibold ${STEP_META[currentStep].color}`}>{STEP_META[currentStep].label}</span>
            <div className="flex gap-1 ml-auto">
              {['OBSERVE','THINK','PLAN','ACT','VERIFY'].map(s => (
                <div
                  key={s}
                  className={`h-1.5 w-6 rounded-full transition-all ${
                    s === currentStep ? 'bg-indigo-500' :
                    ['OBSERVE','THINK','PLAN','ACT','VERIFY'].indexOf(s) < ['OBSERVE','THINK','PLAN','ACT','VERIFY'].indexOf(currentStep)
                      ? 'bg-indigo-800' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder="أرسل مهمة للوكيل..."
            rows={1}
            className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3 text-slate-200 placeholder-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 resize-none min-h-[48px] max-h-[120px] text-sm transition-all"
            style={{ direction: 'rtl' }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || !isConnected}
            className="w-12 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center flex-shrink-0 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 touch-manipulation"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0b0b12] text-slate-200 font-sans overflow-hidden select-none">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-[#0e0e18] border-r border-slate-800/60 flex flex-col z-50"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Bot size={20} className="text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-white text-base leading-none">Manus AI</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">وكيل تصفح ذكي</p>
                  </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all touch-manipulation">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-600 px-2 mb-3 flex items-center gap-2">
                  <History size={12} /> المهام الأخيرة
                </p>
                {tasks.length === 0 ? (
                  <p className="text-center py-10 text-slate-600 text-xs italic">لا توجد مهام بعد</p>
                ) : (
                  <div className="space-y-1">
                    {tasks.map(t => (
                      <button key={t.taskId} className="w-full text-right p-3 rounded-xl hover:bg-slate-800/60 transition-all flex items-center gap-3 border border-transparent hover:border-slate-700/40 touch-manipulation">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          t.status === 'completed' ? 'bg-emerald-500' :
                          t.status === 'failed'    ? 'bg-red-500' : 'bg-indigo-500 animate-pulse'
                        }`} />
                        <span className="truncate text-sm text-slate-400">{t.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-800/50">
                <div className="flex items-center justify-between px-2 mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
                    <span className="text-xs text-slate-500">{isConnected ? 'متصل' : 'غير متصل'}</span>
                  </div>
                </div>
                <button
                  onClick={() => setMessages([])}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border border-slate-700/40 touch-manipulation"
                >
                  <RefreshCw size={14} /> مسح المحادثة
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 bg-[#0d0d15]/90 backdrop-blur-md border-b border-slate-800/50 flex items-center px-4 gap-3 flex-shrink-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all touch-manipulation"
          >
            <ChevronRight size={20} />
          </button>

          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
              <Bot size={15} className="text-white" />
            </div>
            <span className="font-bold text-white text-sm">Manus AI</span>
            {isAgentBusy && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[11px] text-indigo-400 font-medium">
                <Loader2 size={10} className="animate-spin" />
                {currentStep && STEP_META[currentStep] ? STEP_META[currentStep].label : 'يعمل'}
              </span>
            )}
          </div>

          {/* Connection dot */}
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
        </header>

        {/* ── Desktop split / Mobile tabs ──────────────────────────────── */}
        <div className="flex-1 flex min-h-0">

          {/* Desktop: always show both panels */}
          <div className="hidden lg:flex flex-1 min-h-0">
            {/* Chat - 40% */}
            <div className="w-[42%] border-r border-slate-800/50 flex flex-col min-h-0">
              <ChatPanel />
            </div>
            {/* Browser - 58% */}
            <div className="flex-1 flex flex-col min-h-0">
              <BrowserPanel />
            </div>
          </div>

          {/* Mobile/Tablet: tabs */}
          <div className="flex lg:hidden flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0">
              {activeTab === 'chat' ? <ChatPanel /> : <BrowserPanel />}
            </div>

            {/* Bottom tab bar */}
            <div className="flex border-t border-slate-800/50 bg-[#0d0d15] flex-shrink-0">
              {[
                { id: 'chat' as ActiveTab, icon: Bot, label: 'المحادثة' },
                { id: 'browser' as ActiveTab, icon: Monitor, label: 'المتصفح' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all touch-manipulation ${
                    activeTab === tab.id
                      ? 'text-indigo-400 border-t-2 border-indigo-500'
                      : 'text-slate-500 border-t-2 border-transparent'
                  }`}
                >
                  <tab.icon size={20} />
                  <span className="text-[11px] font-medium">{tab.label}</span>
                  {tab.id === 'browser' && isAgentBusy && (
                    <div className="absolute top-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
