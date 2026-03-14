// App.tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart,
  BarChart, Bar, Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, RotateCcw, Brain, Sparkles, Info, 
  TrendingUp, BarChart3, MessageSquare, Settings,
  Coins, ChevronRight, Send, BookOpen, Activity
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getGeminiResponse, getDeepSeekResponse } from './services/geminiService';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Animated Counter Component
function Counter({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const requestRef = useRef<number>(null);
  
  useEffect(() => {
    let start = displayValue;
    const end = value;
    const duration = 300;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = start + (end - start) * progress;
      
      // Safety guard to prevent negative display for non-negative values
      setDisplayValue(Math.max(0, current));
      
      if (progress < 1) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };
    
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [value]);

  return (
    <span>{prefix}{displayValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
  );
}

interface DataPoint {
  trial: number;
  frequency: number;
  theoretical: number;
  upperBound: number;
  lowerBound: number;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export default function App() {
  // Simulation State
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ total: 0, success: 0 });
  const [trials, setTrials] = useState<DataPoint[]>([]);
  const [history, setHistory] = useState<{ id: string; isHeads: boolean }[]>([]);
  
  const [speed, setSpeed] = useState(50); // ms per trial
  const [batchSize, setBatchSize] = useState(1);
  const [probability, setProbability] = useState(0.5); // Coin Bias
  const [targetTrials, setTargetTrials] = useState(1000); // Max trials
  const [animationMode, setAnimationMode] = useState<'batch' | 'trajectory'>('batch');
  
  // AI State
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'deepseek'>('gemini');
  const [customApiKey, setCustomApiKey] = useState('');
  const [isModelConfigured, setIsModelConfigured] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempModel, setTempModel] = useState<'gemini' | 'deepseek'>('gemini');
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: '你好！我是你的概率论导师。大数定律告诉我们，当试验次数足够多时，事件发生的频率会无限接近其概率。想看看硬币投掷的奇迹吗？' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Refs for simulation loop
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTotalRef = useRef(0);

  // Simulation Logic
  const runTrial = useCallback(() => {
    setStats(prev => {
      if (prev.total >= targetTrials) {
        setIsRunning(false);
        return prev;
      }

      const remaining = targetTrials - prev.total;
      const currentBatch = Math.max(0, Math.min(batchSize, remaining));
      
      if (currentBatch === 0) {
        setIsRunning(false);
        return prev;
      }
      
      const newTotal = prev.total + currentBatch;
      let newSuccesses = 0;
      const newHistoryItems: { id: string; isHeads: boolean }[] = [];
      
      for (let i = 0; i < currentBatch; i++) {
        const isHeads = Math.random() < probability;
        if (isHeads) newSuccesses++;
        // Use a more unique ID to prevent key collisions
        newHistoryItems.push({ 
          id: `trial-${prev.total + i}-${Math.random().toString(36).substr(2, 9)}`, 
          isHeads 
        });
      }

      const newSuccessTotal = prev.success + newSuccesses;
      const currentFreq = newSuccessTotal / newTotal;
      const p = probability;

      // Prevent side effects from running multiple times if the updater is re-run by React (Strict Mode)
      if (lastProcessedTotalRef.current !== newTotal) {
        lastProcessedTotalRef.current = newTotal;
        setTimeout(() => {
          setTrials(t => {
            const newData = [...t, { 
              trial: newTotal, 
              frequency: currentFreq, 
              theoretical: p,
              upperBound: p,
              lowerBound: p
            }];
            return newData.slice(-200); 
          });
          setHistory(h => [...h, ...newHistoryItems].slice(-100));
        }, 0);
      }

      return { total: newTotal, success: newSuccessTotal };
    });
  }, [batchSize, targetTrials, probability]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(runTrial, speed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, speed, runTrial]);

  const handleReset = () => {
    setIsRunning(false);
    setTrials([]);
    setStats({ total: 0, success: 0 });
    setHistory([]);
    lastProcessedTotalRef.current = 0;
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    if (!isModelConfigured && !customApiKey) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: '请先点击右上角的齿轮图标，选择大模型并配置 API Key 以激活导师功能。' 
      }]);
      setIsSettingsOpen(true);
      return;
    }
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    const context = `当前试验状态：总次数 ${stats.total}，正面次数 ${stats.success}，当前频率 ${(stats.success/stats.total || 0).toFixed(4)}。理论概率：${probability.toFixed(2)}。用户问：${userMsg}`;
    
    let response;
    if (selectedModel === 'gemini') {
      response = await getGeminiResponse(
        context, 
        'gemini-2.0-flash-exp',
        customApiKey || undefined
      );
    } else {
      // DeepSeek R1 integration
      response = await getDeepSeekResponse(
        context,
        customApiKey || undefined
      );
    }
    
    setMessages(prev => [...prev, { role: 'ai', content: response || "我正在思考这个问题..." }]);
    setIsTyping(false);
  };

  const handleSaveSettings = () => {
    setCustomApiKey(tempApiKey);
    setSelectedModel(tempModel);
    setIsModelConfigured(true);
    setIsSettingsOpen(false);
  };

  // Bar Chart Data
  const barData = [
    { name: '正面 (Heads)', count: stats.success, color: '#fbbf24' },
    { name: '反面 (Tails)', count: stats.total - stats.success, color: '#94a3b8' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <TrendingUp className="text-indigo-600" />
            概率之光：大数定律探索者
          </h1>
          <p className="text-slate-500 mt-1">深度解析频率稳定性与概率收敛的数学之美</p>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Visualization & Controls */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Main Chart Card */}
          <div className="glass-card p-6 flex-1 flex flex-col min-h-[450px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">频率收敛曲线</h2>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>
                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">实时模拟中</span>
                    </div>
                  </div>
                </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                    实际频率: <span className="font-mono font-bold text-indigo-600">
                      <Counter value={stats.total > 0 ? stats.success / stats.total : 0} decimals={4} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                    理论概率: <span className="font-mono font-bold">{probability.toFixed(2)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trials} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorFreq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="trial" 
                    type="number" 
                    domain={[0, targetTrials]} 
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    label={{ value: '试验次数', position: 'insideBottomRight', offset: -10, fontSize: 12 }}
                  />
                  <YAxis 
                    domain={[0, 1]} 
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    label={{ value: '频率', angle: -90, position: 'insideLeft', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [value.toFixed(4), name === 'frequency' ? '实际频率' : name]}
                  />
                  <ReferenceLine y={probability} stroke="#94a3b8" strokeDasharray="5 5" label={{ position: 'right', value: probability.toFixed(2), fill: '#94a3b8', fontSize: 12 }} />
                  
                  <Area 
                    type="monotone" 
                    dataKey="frequency" 
                    stroke="none" 
                    fill="url(#colorFreq)" 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="frequency" 
                    stroke="#4f46e5" 
                    strokeWidth={4} 
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props;
                      if (index === trials.length - 1) {
                        return (
                          <g key="pulsing-dot">
                            <circle cx={cx} cy={cy} r={8} fill="#4f46e5" opacity={0.3}>
                              <animate attributeName="r" from="4" to="12" dur="1.5s" repeatCount="indefinite" />
                              <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={cx} cy={cy} r={4} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
                          </g>
                        );
                      }
                      return null;
                    }} 
                    isAnimationActive={true}
                    animationDuration={300}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Modules: Knowledge & Bar Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Knowledge Module */}
            <div className="glass-card p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800">伯努利大数定律</h3>
              </div>
              <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-center">
                  <div className="text-indigo-600 font-bold mb-1">数学表达</div>
                  <div className="text-sm md:text-base break-all">
                    {"lim (n→∞) P(|m/n - p| < ε) = 1"}
                  </div>
                </div>
                <p>
                  <span className="font-bold text-slate-800">核心意义：</span> 
                  在独立重复试验中，随着试验次数 $n$ 的增加，事件发生的频率 $m/n$ 
                  以概率收敛于该事件的概率 $p$。
                </p>
                <p>
                  这揭示了随机现象在大量重复中表现出的<span className="text-indigo-600 font-bold">必然规律性</span>，
                  是概率论中最重要的基石之一。
                </p>
              </div>
            </div>

            {/* Bar Chart Module */}
            <div className="glass-card p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800">条形图可视化</h3>
              </div>
              <div className="flex-1 min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '12px' }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={60}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex justify-between text-xs font-mono text-slate-400">
                <span>正面: {stats.success}</span>
                <span>反面: {stats.total - stats.success}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Tutor & Animation */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Coin Animation Area */}
          <div className="glass-card p-6 h-[400px] flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 z-10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                <Coins size={14} /> 实时动画模块
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                <button 
                  onClick={() => setAnimationMode('batch')}
                  className={cn("px-2 py-1 text-[10px] rounded-md transition-all", animationMode === 'batch' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
                >批量</button>
                <button 
                  onClick={() => setAnimationMode('trajectory')}
                  className={cn("px-2 py-1 text-[10px] rounded-md transition-all", animationMode === 'trajectory' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
                >轨迹</button>
              </div>
            </div>
            
            <div className="flex-1 flex items-center justify-center relative">
              {/* Batch Mode */}
              {animationMode === 'batch' && (
                <div className="absolute inset-0 flex flex-wrap content-start justify-center gap-2 p-4 overflow-hidden">
                  <AnimatePresence mode="popLayout">
                    {history.slice(-24).map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ y: -50, opacity: 0, rotateY: 180, scale: 0.5 }}
                        animate={{ y: 0, opacity: 1, rotateY: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 relative",
                          item.isHeads 
                            ? "bg-gradient-to-br from-amber-300 to-amber-500 border-amber-600 text-amber-900" 
                            : "bg-gradient-to-br from-slate-200 to-slate-400 border-slate-500 text-slate-700"
                        )}
                      >
                        {item.isHeads && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 0.5] }}
                            transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
                            className="absolute -top-1 -right-1 text-amber-200"
                          >
                            <Sparkles size={12} />
                          </motion.div>
                        )}
                        {item.isHeads ? "正" : "反"}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Trajectory Mode */}
              {animationMode === 'trajectory' && (
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
                  <div className="flex flex-wrap-reverse justify-center gap-1 max-w-full px-4">
                    {history.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn(
                          "w-3 h-3 rounded-full shadow-sm",
                          item.isHeads ? "bg-amber-400" : "bg-slate-400"
                        )}
                        title={item.isHeads ? "正面" : "反面"}
                      />
                    ))}
                  </div>
                  <div className="mt-4 text-[10px] text-slate-400 font-medium bg-slate-100 px-3 py-1 rounded-full">
                    历史轨迹 (最近 100 次)
                  </div>
                </div>
              )}

              {!isRunning && stats.total === 0 && (
                <div className="text-slate-300 flex flex-col items-center gap-2">
                  <Coins size={64} className="opacity-20" />
                  <span className="text-sm font-medium">点击开始投掷</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Tutor Chat */}
          <div className="glass-card flex-1 flex flex-col overflow-hidden min-h-[450px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                  <Brain size={16} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">AI 概率导师</div>
                  <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {selectedModel === 'gemini' ? 'Gemini' : 'DeepSeek'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isSettingsOpen ? "bg-indigo-100 text-indigo-600" : "hover:bg-slate-200 text-slate-500"
                  )}
                  title="模型设置"
                >
                  <Settings size={18} />
                </button>
                <Sparkles className="text-amber-400 w-5 h-5" />
              </div>
            </div>

            <AnimatePresence>
              {isSettingsOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-white border-b border-slate-100 p-4 space-y-4 overflow-hidden"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">选择模型</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setTempModel('gemini')}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                          tempModel === 'gemini' ? "bg-indigo-600 border-indigo-600 text-white shadow-md" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        Gemini 2.0 Flash
                      </button>
                      <button 
                        onClick={() => setTempModel('deepseek')}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                          tempModel === 'deepseek' ? "bg-indigo-600 border-indigo-600 text-white shadow-md" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        DeepSeek R1
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {tempModel === 'gemini' ? 'Gemini API Key' : 'DeepSeek API Key'}
                    </label>
                    <input 
                      type="password"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder={`输入您的 ${tempModel === 'gemini' ? 'Gemini' : 'DeepSeek'} API Key...`}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {tempModel === 'gemini' 
                        ? '从 Google AI Studio 获取 API Key' 
                        : '从 DeepSeek 平台获取 API Key'}
                    </p>
                  </div>
                  <button 
                    onClick={handleSaveSettings}
                    className="w-full py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-all shadow-sm"
                  >
                    保存设置
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white ml-auto rounded-tr-none" 
                      : "bg-slate-100 text-slate-700 mr-auto rounded-tl-none"
                  )}
                >
                  {msg.content}
                </motion.div>
              ))}
              {isTyping && (
                <div className="bg-slate-100 text-slate-400 p-3 rounded-2xl rounded-tl-none w-16 flex justify-center gap-1">
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
              <div className="relative">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="询问关于大数定律的问题..."
                  className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Controls & Stats (Moved up or integrated) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Simulation Controls */}
        <div className="glass-card p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <Settings className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold">模拟控制</h3>
          </div>
          
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 items-center">
                <button 
                  onClick={() => setIsRunning(!isRunning)}
                  className={cn(
                    "btn-primary flex items-center gap-2 min-w-[140px] justify-center",
                    isRunning && "bg-amber-500 hover:bg-amber-600 shadow-amber-200"
                  )}
                >
                  {isRunning ? <><Pause size={18} /> 暂停模拟</> : <><Play size={18} /> 开始模拟</>}
                </button>
                <button 
                  onClick={handleReset}
                  className="btn-secondary flex items-center gap-2"
                >
                  <RotateCcw size={18} /> 重置
                </button>
                
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs font-medium text-slate-500">快速开始:</span>
                  {[100, 500, 1000, 10000].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        handleReset();
                        setTargetTrials(n);
                        setTimeout(() => setIsRunning(true), 100);
                      }}
                      className="px-3 py-1 text-xs font-bold rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-100"
                    >
                      {n}次
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600 flex justify-between">
                    模拟速度 <span>{speed}ms</span>
                  </label>
                  <input 
                    type="range" min="10" max="500" step="10" 
                    value={speed} 
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600 flex justify-between">
                    单次投掷数 <span>{batchSize}次</span>
                  </label>
                  <input 
                    type="range" min="1" max="100" step="1" 
                    value={batchSize} 
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600 flex justify-between">
                    理论概率 P(正面) <span>{probability.toFixed(2)}</span>
                  </label>
                  <input 
                    type="range" min="0" max="1" step="0.01" 
                    value={probability} 
                    onChange={(e) => {
                      setProbability(Number(e.target.value));
                      if (stats.total === 0) handleReset(); 
                    }}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600 flex justify-between">
                    试验次数 <span>{targetTrials}次</span>
                  </label>
                  <input 
                    type="range" min="10" max="10000" step="10" 
                    value={targetTrials} 
                    onChange={(e) => setTargetTrials(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                  />
                </div>
              </div>
            </div>
        </div>

        {/* Live Stats */}
        <div className="glass-card p-6 bg-gradient-to-br from-indigo-600 to-violet-700 text-white border-none relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity size={80} />
          </div>
          <h3 className="text-indigo-100 text-sm font-medium mb-4 uppercase tracking-wider relative z-10">实时统计</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <div className="text-indigo-200 text-xs mb-1">总试验次数</div>
              <div className="text-3xl font-bold font-mono">
                <Counter value={stats.total} />
              </div>
            </div>
            <div>
              <div className="text-indigo-200 text-xs mb-1">正面 (Success)</div>
              <div className="text-2xl font-bold font-mono text-emerald-300">
                <Counter value={stats.success} />
              </div>
            </div>
            <div className="pt-2 border-t border-white/10">
              <div className="text-indigo-200 text-xs mb-1">当前偏差 (vs 理论)</div>
              <div className="text-xl font-bold font-mono">
                <Counter value={stats.total > 0 ? Math.abs((stats.success / stats.total) - probability) : 0} decimals={4} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="glass-card p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Info size={14} /> 知识点：伯努利大数定律</span>
          <span className="hidden md:inline">|</span>
          <span>公式：lim (n→∞) P(|m/n - p| &lt; ε) = 1</span>
        </div>
        <div className="flex items-center gap-2">
          基于 <span className="font-bold text-slate-600">
            {selectedModel === 'gemini' ? 'Gemini 2.0 Flash' : 'DeepSeek R1'}
          </span> 构建的智能教学系统
        </div>
      </footer>
    </div>
  );
}