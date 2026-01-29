
import React, { useRef, useEffect, useState } from 'react';
import { Message, Role } from '../types';
import { SendIcon } from './Icons';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  groundingSources?: Array<{ title: string; uri: string }>;
}

const SUGGESTED_QUESTIONS = [
  "📍 ROI",
  "📈 Frais",
  "🏢 Ready",
  "💎 Zones"
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isStreaming, groundingSources }) => {
  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-gradient-to-b from-[#0d1324]/90 to-[#0b1021]/95 backdrop-blur-3xl rounded-[1.5rem] overflow-hidden border border-white/10 shadow-[0_20px_60px_-35px_rgba(0,0,0,0.9)] relative">
      
      {/* Decorative Accents */}
      <div className="absolute top-0 left-0 w-10 h-10 border-t-[2px] border-l-[2px] border-gold-300/60 rounded-tl-[1.2rem] z-30 pointer-events-none opacity-60"></div>
      
      {/* Header - Fixed Height */}
      <div className="shrink-0 bg-black/50 p-3 border-b border-white/10 flex items-center justify-between z-20 backdrop-blur-md h-[64px]">
         <div className="flex items-center gap-2 overflow-hidden">
            <div className="shrink-0 w-2.5 h-2.5 bg-aqua-300 rounded-full animate-pulse shadow-[0_0_12px_rgba(23,180,212,0.7)]"></div>
            <div className="truncate">
                <h3 className="font-serif text-white text-[13px] tracking-wide truncate">Conseil IA</h3>
                <p className="text-[8px] text-slate-500 uppercase tracking-[0.24em] font-black">Live DLD</p>
            </div>
         </div>
      </div>

      {/* 
        MESSAGES AREA : 
        C'est ici que l'on verrouille le scrolling.
        flex-1 + min-h-0 + overflow-y-auto est la combinaison magique.
      */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-4 scrollbar-thin scrollbar-thumb-white/10 bg-gradient-to-b from-white/5 to-transparent"
      >
         {messages.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 text-center px-4 opacity-50">
                 <div className="loader !m-0 !w-8 !h-8 !border-2"></div>
                 <p className="text-[7px] uppercase tracking-[0.2em] font-black">Audit en cours...</p>
             </div>
         )}

         {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-fade-up w-full`}>
                <div className={`
                  relative px-3 py-2 rounded-xl max-w-full text-[11px] leading-snug shadow-lg border break-words
                  ${msg.role === Role.MODEL 
                    ? 'bg-midnight-900/95 border-white/5 text-slate-300 rounded-tl-none ring-1 ring-white/5 w-[95%]' 
                    : 'bg-gold-500/10 border-gold-400/20 text-gold-50 rounded-tr-none font-medium'
                  }
                `}>
                    <div className="w-full overflow-hidden">
                      {msg.text.split('\n').map((line, i) => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('####')) return <h5 key={i} className="text-white font-bold text-[10px] mt-2 mb-1">{trimmed.replace('#### ', '')}</h5>;
                        if (trimmed.startsWith('###')) return <h4 key={i} className="text-gold-400 font-serif text-[12px] mt-3 mb-1">{trimmed.replace('### ', '')}</h4>;
                        if (trimmed.startsWith('-')) return <li key={i} className="ml-2 list-disc text-slate-400 my-1 break-words">{trimmed.replace('- ', '')}</li>;
                        return trimmed === '' ? <div key={i} className="h-2" /> : <p key={i} className="mb-1 break-words whitespace-pre-wrap">{trimmed}</p>;
                      })}
                    </div>
                </div>
            </div>
         ))}
         
         {groundingSources && groundingSources.length > 0 && !isStreaming && (
            <div className="mt-4 p-2 bg-gold-500/5 rounded-xl border border-gold-500/10 w-full overflow-hidden">
               <p className="text-[7px] text-gold-400 font-black uppercase tracking-[0.3em] mb-1 opacity-60">Sources</p>
               <div className="flex flex-col gap-1">
                  {groundingSources.slice(0, 2).map((source, idx) => (
                    <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="text-[8px] truncate block text-slate-500 hover:text-gold-400">
                      🔗 {source.title || 'Source DLD'}
                    </a>
                  ))}
               </div>
            </div>
         )}

         {isStreaming && (
            <div className="flex justify-start mb-4">
                <div className="bg-gold-500/5 border border-gold-500/10 px-2 py-1 rounded-lg italic text-[7px] text-gold-400 uppercase tracking-widest font-black">
                    IA Analyse...
                </div>
            </div>
         )}
      </div>

      {/* Input Area - Fixed height */}
      <div className="shrink-0 p-3 bg-midnight-900 border-t-[2px] border-gold-500/30 z-30">
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(q)}
              disabled={isStreaming}
              className="whitespace-nowrap px-2 py-1 bg-white/5 hover:bg-gold-500/10 text-slate-500 hover:text-gold-300 text-[7px] uppercase font-black tracking-widest rounded transition-all border border-white/5"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="..."
            className={`flex-1 bg-black/50 border rounded-lg px-2 py-2 focus:bg-black outline-none transition-all text-[11px] text-white placeholder-slate-800 min-w-0
              ${isStreaming ? 'border-white/5 opacity-50' : 'border-white/10 focus:border-gold-500/40'}
            `}
            disabled={isStreaming}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isStreaming}
            className="w-10 h-10 bg-gradient-to-br from-aqua-300 via-gold-300 to-gold-500 text-midnight-950 rounded-xl transition-all flex items-center justify-center shrink-0 active:scale-95 shadow-[0_12px_40px_-18px_rgba(23,180,212,0.7)]"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
