
import React, { useEffect, useState, useRef } from 'react';
import { ChartDataPoint } from '../types';
import { BurjKhalifaIcon, EiffelTowerIcon } from './Icons';

interface GrowthVisualizerProps {
  data: ChartDataPoint[];
  duration: number;
}

const GrowthVisualizer: React.FC<GrowthVisualizerProps> = ({ data, duration }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const currentYearData = data[currentIndex] || data[0];
  
  // Calculate Scaling Factor based on the MAXIMUM projected value (Dubai End)
  // This ensures towers grow proportionally to the screen height
  const maxCapital = Math.max(
    ...data.map(d => Math.max(d.scenarioOptimiste, d.scenarioFrance))
  );

  // Min height 10% so they are visible at start
  const dubaiHeightPercent = 10 + ((currentYearData.scenarioOptimiste / maxCapital) * 85);
  const franceHeightPercent = 10 + ((currentYearData.scenarioFrance / maxCapital) * 85);
  const investedHeightPercent = 10 + ((currentYearData.investedAmount / maxCapital) * 85);

  // Animation Loop
  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = time - lastTimeRef.current;
      
      // Update every 600ms
      if (deltaTime > 600 && isPlaying) {
        setCurrentIndex(prev => {
          if (prev >= data.length - 1) {
            setIsPlaying(false); // Stop at end
            return prev;
          }
          return prev + 1;
        });
        lastTimeRef.current = time;
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, data]);

  const togglePlay = () => {
    if (!isPlaying && currentIndex >= data.length - 1) {
        setCurrentIndex(0); // Restart if at end
    }
    setIsPlaying(!isPlaying);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="glass-panel p-8 rounded-2xl border border-white/5 relative overflow-hidden min-h-[500px] flex flex-col">
      
      {/* HEADER & CONTROLS */}
      <div className="flex justify-between items-start z-30 mb-4">
        <div>
          <h3 className="text-3xl font-serif text-white">
             Course de Rendement
          </h3>
          <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">
             Comparatif visuel du patrimoine net
          </p>
        </div>
        <button 
          onClick={togglePlay}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors border border-white/10 backdrop-blur"
        >
          {isPlaying ? 'Pause' : (currentIndex >= data.length - 1 ? 'Rejouer' : 'Lecture')}
        </button>
      </div>

      {/* CENTRAL YEAR DISPLAY */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 text-center">
         <span className="text-6xl font-serif text-white/10 font-bold select-none">
            {currentYearData.year.replace('An ', '')}
         </span>
         <span className="block text-[10px] text-white/20 uppercase tracking-[0.5em]">Années</span>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-8 relative z-20 pb-0 px-4 items-end max-w-4xl mx-auto w-full">
        
        {/* LEFT: FRANCE TOWER */}
        <div className="relative flex flex-col items-center justify-end h-full group">
           {/* Value Label */}
           <div 
             className="absolute transition-all duration-500 ease-out z-30 -translate-y-full mb-4"
             style={{ bottom: `${franceHeightPercent}%` }}
           >
              <div className="bg-slate-800/90 text-blue-200 text-sm font-bold px-3 py-1 rounded-lg border border-blue-500/30 shadow-xl backdrop-blur whitespace-nowrap">
                {formatCurrency(currentYearData.scenarioFrance)}
              </div>
           </div>

           {/* Tower Graphic */}
           <div 
                className="w-24 md:w-32 transition-all duration-700 ease-linear origin-bottom relative flex items-end justify-center"
                style={{ height: `${franceHeightPercent}%` }}
            >
                <EiffelTowerIcon className="w-full h-full text-slate-400 drop-shadow-[0_0_15px_rgba(148,163,184,0.3)]" />
           </div>
           
           <div className="mt-4 text-center absolute -bottom-6 w-full">
               <p className="text-white font-serif text-lg">France</p>
           </div>
        </div>


        {/* MIDDLE: INVESTED CASH STACK */}
        <div className="relative flex flex-col items-center justify-end h-full">
             {/* Value Label */}
             <div 
                className="absolute transition-all duration-500 ease-out z-30 -translate-y-full mb-4"
                style={{ bottom: `${investedHeightPercent}%` }}
             >
                <div className="bg-emerald-900/90 text-emerald-200 text-sm font-bold px-3 py-1 rounded-lg border border-emerald-500/30 shadow-xl backdrop-blur whitespace-nowrap">
                    {formatCurrency(currentYearData.investedAmount)}
                </div>
             </div>

             {/* Cash Stack Graphic */}
             <div 
                className="w-20 md:w-24 transition-all duration-700 ease-linear origin-bottom relative rounded-t-lg border-x border-t border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                style={{ 
                    height: `${investedHeightPercent}%`,
                    background: 'repeating-linear-gradient(0deg, #064e3b, #064e3b 2px, #065f46 2px, #065f46 4px)'
                }}
             >
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
             </div>

             <div className="mt-4 text-center absolute -bottom-6 w-full">
               <p className="text-emerald-400 font-serif text-lg">Investi</p>
             </div>
        </div>


        {/* RIGHT: DUBAI TOWER */}
        <div className="relative flex flex-col items-center justify-end h-full group">
           {/* Value Label */}
           <div 
             className="absolute transition-all duration-500 ease-out z-30 -translate-y-full mb-4"
             style={{ bottom: `${dubaiHeightPercent}%` }}
           >
              <div className="bg-gold-500/90 text-midnight-950 text-base font-bold px-3 py-1 rounded-lg border border-gold-300 shadow-[0_0_20px_rgba(212,175,55,0.4)] backdrop-blur whitespace-nowrap transform scale-110">
                {formatCurrency(currentYearData.scenarioOptimiste)}
              </div>
           </div>

           {/* Tower Graphic */}
           <div 
             className="w-24 md:w-32 transition-all duration-700 ease-linear origin-bottom relative flex items-end justify-center"
             style={{ height: `${dubaiHeightPercent}%` }}
           >
              <BurjKhalifaIcon className="w-full h-full text-gold-400 drop-shadow-[0_0_30px_rgba(212,175,55,0.5)]" />
              {/* Glow base */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-1/3 bg-gold-500/10 blur-xl rounded-full pointer-events-none"></div>
           </div>

           <div className="mt-4 text-center absolute -bottom-6 w-full">
               <p className="text-gold-400 font-serif text-lg">Dubaï</p>
           </div>
        </div>

      </div>
      
      {/* Floor */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-30"></div>
    </div>
  );
};

export default GrowthVisualizer;
