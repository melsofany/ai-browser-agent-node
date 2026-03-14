import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Send, 
  Bot, 
  User, 
  Brain, 
  Info, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw, 
  History, 
  Monitor, 
  ChevronRight,
  Settings,
  Terminal,
  AlertTriangle,
  Maximize2,
  Minimize2,
  X,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  type: 'user' | 'agent' | 'thinking' | 'system';
  text: string;
  timestamp: Date;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'info' | 'warning' | 'awaiting_user';
  level?: 'info' | 'error' | 'warning' | 'success';
  data?: any;
}

interface Task {
  taskId: string;
  description: string;
  status: string;
  createdAt: string;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [browserImage, setBrowserImage] = useState<string | null>(null);
  const [currentTaskStatus, setCurrentTaskStatus] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const browserImgRef = useRef<HTMLImageElement>(null);

  const handleBrowserInteraction = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!socketRef.current || !browserImgRef.current) return;

    const rect = browserImgRef.current.getBoundingClientRect();
    const type = e.type;
    
    let params: any = {};

    if ('clientX' in e && 'clientY' in e) {
      // Mouse events
      const x = ((e as React.MouseEvent).clientX - rect.left) / rect.width;
      const y = ((e as React.MouseEvent).clientY - rect.top) / rect.height;
      
      params = {
        x: Math.round(x * 1280),
        y: Math.round(y * 720),
        button: (e as React.MouseEvent).button === 2 ? 'right' : 'left'
      };
    } else if (type === 'wheel') {
      // Scroll events
      params = {
        deltaX: (e as React.WheelEvent).deltaX,
        deltaY: (e as React.WheelEvent).deltaY
      };
    } else if ('key' in e) {
      // Keyboard events
      params = {
        key: (e as React.KeyboardEvent).key
      };
    }

    socketRef.current.emit('browserEvent', {
      type,
      pageId: 'default',
      params
    });
  };

  const handleResumeTask = (taskId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('resumeTask', taskId);
    }
  };

  const handleTriggerSelfImprovement = () => {
    if (socketRef.current) {
      socketRef.current.emit('triggerSelfImprovement');
      addSystemMessage('Triggering self-improvement audit...', 'info');
    }
  };

  useEffect(() => {
    // Connect to Socket.io
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      addSystemMessage('Connected to server successfully', 'info');
      socket.emit('getStatus');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      addSystemMessage('Disconnected from server', 'error');
    });

    socket.on('status', (data: { tasks: Task[] }) => {
      setTasks(data.tasks || []);
    });

    socket.on('taskUpdate', (data: any) => {
      socket.emit('getStatus');
      
      if (data.type === 'step_start') {
        addAgentMessage(`Executing step: ${data.stepDescription}`, 'running');
      } else if (data.step === 'MEMORY') {
        addAgentMessage(data.message, 'info', data.data);
      } else if (data.type === 'status_change') {
        if (data.status === 'completed') {
          addAgentMessage(`Task completed successfully`, 'completed');
        } else if (data.status === 'failed') {
          const isCritical = data.error?.includes('CRITICAL ERROR');
          addAgentMessage(isCritical ? `⚠️ ${data.error}` : `Task failed: ${data.error}`, 'failed');
          if (isCritical) {
            addSystemMessage('Please check your API Key in AI Studio Secrets', 'error');
          }
        } else if (data.status === 'awaiting_user') {
          addAgentMessage(`Agent is waiting for user input...`, 'awaiting_user');
        }
      }
    });

    socket.on('taskStart', (data: any) => {
      addSystemMessage(`Task started: ${data.description}`, 'info');
    });

    socket.on('taskSuccess', (data: any) => {
      addSystemMessage(`Task ${data.taskId} finished successfully`, 'success');
    });

    socket.on('taskFail', (data: any) => {
      const isCritical = data.error?.includes('CRITICAL ERROR');
      addSystemMessage(isCritical ? `⚠️ ${data.error}` : `Task ${data.taskId} failed: ${data.error}`, 'error');
    });

    socket.on('selfImprovementTriggered', (data: any) => {
      if (data.success && data.proposal) {
        addSystemMessage(`Self-improvement task created: ${data.proposal.title}`, 'success');
      } else {
        addSystemMessage(`Self-improvement check: ${data.message || 'No improvements found'}`, 'info');
      }
    });

    socket.on('thinking', (data: { content: string }) => {
      const content = data.content;
      if (content.startsWith('[') && content.includes(']')) {
        const status = content.split(']')[0].substring(1);
        setCurrentTaskStatus(status);
      }
      addThinkingMessage(content);
    });

    socket.on('browserStream', (data: { image: string }) => {
      if (data.image) {
        setBrowserImage(`data:image/jpeg;base64,${data.image}`);
      }
    });

    socket.on('log', (log: { level: string; message: string }) => {
      if (log.level === 'error') {
        addSystemMessage(log.message, 'error');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addSystemMessage = (text: string, level: 'info' | 'error' | 'warning' | 'success' = 'info') => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'system',
      text,
      timestamp: new Date(),
      level
    }]);
  };

  const addAgentMessage = (text: string, status: Message['status'] = 'completed', data?: any) => {
    setMessages(prev => {
      // Avoid duplicate running messages for the same step
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.type === 'agent' && lastMsg.text === text && lastMsg.status === status) {
        return prev;
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        type: 'agent',
        text,
        timestamp: new Date(),
        status,
        data
      }];
    });
  };

  const addThinkingMessage = (text: string) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.type === 'thinking') {
        return [
          ...prev.slice(0, -1),
          { ...lastMsg, text: lastMsg.text + '\n' + text }
        ];
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        type: 'thinking',
        text,
        timestamp: new Date()
      }];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !socketRef.current) return;

    const text = inputValue.trim();
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'user',
      text,
      timestamp: new Date()
    }]);

    socketRef.current.emit('submitTask', {
      description: text,
      type: 'browser',
      priority: 'normal'
    });

    setInputValue('');
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.type === 'user';
    const isThinking = msg.type === 'thinking';
    const isSystem = msg.type === 'system';

    if (isSystem) {
      return (
        <div key={msg.id} className="flex justify-center my-4">
          <div className={`px-4 py-1 rounded-full text-[11px] flex items-center gap-2 border ${
            msg.level === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
            msg.level === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
            msg.level === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            'bg-slate-800/30 border-slate-700/50 text-slate-500'
          }`}>
            {msg.level === 'success' ? <Check size={12} /> : <Info size={12} />}
            {msg.text}
          </div>
        </div>
      );
    }

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
      >
        <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-indigo-600 ml-3' : 
            isThinking ? 'bg-slate-700 mr-3' : 
            'bg-slate-800 border border-slate-700 mr-3'
          }`}>
            {isUser ? <User size={16} className="text-white" /> : 
             isThinking ? <Brain size={16} className="text-indigo-400" /> : 
             <Bot size={16} className="text-indigo-400" />}
          </div>
          
          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={`p-4 rounded-2xl shadow-sm ${
              isUser ? 'bg-indigo-600/20 border border-indigo-500/30 text-white rounded-tr-none' : 
              isThinking ? 'bg-slate-800/40 border border-slate-700/50 text-slate-300 italic text-sm rounded-tl-none' :
              'bg-slate-800 border border-slate-700 text-white rounded-tl-none'
            }`}>
              {isThinking && (
                <div className="flex items-center mb-2 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  <Loader2 size={10} className="animate-spin mr-1" /> Agent Thinking...
                </div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>

              {msg.type === 'agent' && msg.data && (
                <div className="mt-4 space-y-3">
                  {msg.data.tasks && msg.data.tasks.length > 0 && (
                    <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                        <History size={12} /> Similar Past Tasks
                      </div>
                      <div className="space-y-2">
                        {msg.data.tasks.map((task: any, i: number) => (
                          <div key={i} className="text-xs text-slate-400 border-l-2 border-indigo-500/30 pl-2 py-1">
                            {task.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {msg.data.errors && msg.data.errors.length > 0 && (
                    <div className="bg-red-500/5 rounded-xl p-3 border border-red-500/10">
                      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                        <AlertTriangle size={12} /> Past Errors & Solutions
                      </div>
                      <div className="space-y-2">
                        {msg.data.errors.map((err: any, i: number) => (
                          <div key={i} className="text-xs text-slate-400">
                            <div className="font-medium text-red-300/70">{err.errorType}</div>
                            <div className="text-[10px] italic text-slate-500 mt-1">{err.solution}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {msg.status && msg.status !== 'completed' && msg.status !== 'info' && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className={`px-3 py-1 rounded-lg text-[11px] font-medium flex items-center gap-2 w-fit ${
                    msg.status === 'running' ? 'bg-indigo-500/20 text-indigo-400' :
                    msg.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    msg.status === 'awaiting_user' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {msg.status === 'running' ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                    {msg.status === 'running' ? 'Executing...' : msg.status === 'warning' ? 'Waiting' : msg.status === 'awaiting_user' ? 'Needs Intervention' : 'Failed'}
                  </div>
                  
                  {msg.status === 'awaiting_user' && (
                    <button
                      onClick={() => {
                        // Find the task ID associated with this message if possible
                        // For now, we'll assume it's the last task
                        const lastTask = tasks[tasks.length - 1];
                        if (lastTask) handleResumeTask(lastTask.taskId);
                      }}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 w-fit"
                    >
                      <Check size={14} />
                      Resume Task
                    </button>
                  )}
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }}
        className="border-r border-slate-800/50 bg-[#0d0d0f] flex flex-col overflow-hidden"
      >
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot size={20} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-white">Manus AI</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h2 className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Recent Tasks</h2>
              <History size={14} className="text-slate-600" />
            </div>
            <div className="space-y-1">
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-xs italic">
                  No tasks yet
                </div>
              ) : (
                tasks.map(task => (
                  <button 
                    key={task.taskId}
                    className="w-full text-left p-3 rounded-xl hover:bg-slate-800/50 transition-all group flex items-center gap-3 border border-transparent hover:border-slate-700/30"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      task.status === 'completed' ? 'bg-emerald-500' : 
                      task.status === 'failed' ? 'bg-red-500' : 'bg-indigo-500 animate-pulse'
                    }`} />
                    <span className="truncate text-sm text-slate-400 group-hover:text-slate-200">{task.description}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800/50">
          <div className="flex items-center justify-between px-2 mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <span className="text-[11px] font-medium text-slate-500">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <button className="text-slate-500 hover:text-white transition-colors">
              <Settings size={16} />
            </button>
          </div>
          <button 
            onClick={() => setMessages([])}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border border-slate-700/50"
          >
            <RefreshCw size={14} />
            Clear History
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-800/50 bg-[#0a0a0c]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
            >
              <ChevronRight size={20} className={`transition-transform duration-300 ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
            <h2 className="font-semibold text-slate-200">AI Browser Agent</h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleTriggerSelfImprovement}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20 transition-all"
              title="Trigger AI Self-Improvement Audit"
            >
              <Brain size={16} />
              Self-Improvement
            </button>
            <button 
              onClick={() => setShowBrowser(!showBrowser)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                showBrowser ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Monitor size={16} />
              {showBrowser ? 'Hide Browser' : 'Show Browser'}
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-hide">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center mb-8 border border-indigo-500/20">
                  <Bot size={40} className="text-indigo-500" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">How can I help you today?</h3>
                <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                  I can browse the web, research topics, and execute complex tasks using my built-in browser capabilities.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 w-full max-w-2xl">
                  {[
                    "Search for the latest AI news today",
                    "Go to Al Jazeera and show main headlines",
                    "Find the best pizza places in Rome",
                    "Analyze the stock price of NVIDIA"
                  ].map((suggestion, i) => (
                    <button 
                      key={i}
                      onClick={() => setInputValue(suggestion)}
                      className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-2xl text-left hover:bg-slate-800/60 hover:border-indigo-500/30 transition-all group"
                    >
                      <p className="text-sm text-slate-400 group-hover:text-slate-200">{suggestion}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(renderMessage)
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-slate-800/50 bg-[#0a0a0c]">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Message Manus AI..."
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-4 pl-5 pr-14 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none min-h-[60px] max-h-[200px]"
              rows={1}
            />
            <button 
              type="submit"
              disabled={!inputValue.trim() || !isConnected}
              className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
            >
              <Send size={20} />
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-600 mt-4 uppercase tracking-widest font-bold">
            Manus AI can make mistakes. Check important info.
          </p>
        </div>

        {/* Browser Overlay */}
        <AnimatePresence>
          {showBrowser && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                width: isMinimized ? 300 : 'min(90%, 1000px)',
                height: isMinimized ? 48 : 'min(80%, 700px)',
                bottom: 24,
                right: 24
              }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`fixed z-50 bg-[#16161a] border border-slate-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}
            >
              <div className="h-12 bg-slate-900/50 border-b border-slate-800/50 flex items-center justify-between px-4 cursor-move">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Monitor size={12} />
                    Browser View
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-colors"
                  >
                    {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                  </button>
                  <button 
                    onClick={() => setShowBrowser(false)}
                    className="p-1.5 hover:bg-red-500/20 hover:text-red-500 rounded-md text-slate-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              
              {!isMinimized && (
                <div className="flex flex-col h-full">
                  {/* Browser Toolbar */}
                  <div className="bg-slate-800/30 border-b border-slate-800/50 p-2 flex items-center gap-2">
                    <button 
                      onClick={() => socketRef.current?.emit('browserEvent', { type: 'reload', pageId: 'default' })}
                      className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors"
                      title="Reload"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <div className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-1 flex items-center gap-2">
                      <Bot size={12} className="text-slate-500" />
                      <input 
                        type="text" 
                        placeholder="Enter URL..."
                        className="bg-transparent border-none outline-none text-xs text-slate-300 w-full"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const url = (e.target as HTMLInputElement).value;
                            socketRef.current?.emit('browserEvent', { type: 'navigate', pageId: 'default', params: { url } });
                          }
                        }}
                      />
                    </div>
                  </div>

                    <div 
                      className="flex-1 bg-black relative group outline-none min-h-0"
                      tabIndex={0}
                      onKeyDown={handleBrowserInteraction}
                      onKeyUp={handleBrowserInteraction}
                      onWheel={handleBrowserInteraction}
                    >
                    {browserImage ? (
                      <img 
                        ref={browserImgRef}
                        src={browserImage} 
                        alt="Browser View" 
                        className="w-full h-full object-contain cursor-crosshair"
                        referrerPolicy="no-referrer"
                        onClick={handleBrowserInteraction}
                        onDoubleClick={handleBrowserInteraction}
                        onMouseDown={handleBrowserInteraction}
                        onMouseUp={handleBrowserInteraction}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          handleBrowserInteraction(e);
                        }}
                        onMouseMove={(e) => {
                          // Throttled mouse move could be added here if needed
                        }}
                      />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-4">
                      <div className="w-12 h-12 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
                      <p className="text-sm font-medium">Initializing browser stream...</p>
                    </div>
                  )}
                  
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      <Terminal size={12} />
                      Live Stream Active
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-2" />
                    <div className="flex items-center gap-2 text-[10px] text-indigo-400 uppercase tracking-widest font-bold">
                      <CheckCircle2 size={12} />
                      Manual Control Enabled (Click, Type, Scroll)
                    </div>
                  </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
