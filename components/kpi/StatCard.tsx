import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, subValue, trend, icon }) => {
  return (
    <div className="glass-panel p-6 rounded-2xl flex items-start justify-between hover:bg-white/5 transition-colors group">
      <div>
        <p className="text-[10px] font-bold text-gold-400 uppercase tracking-widest mb-2 opacity-80">{label}</p>
        <h4 className="text-3xl font-serif text-white mb-1 group-hover:text-gold-200 transition-colors">{value}</h4>
        {subValue && (
          <p className={`text-xs font-medium ${trend === 'up' ? 'text-green-400' : 'text-slate-400'}`}>
            {subValue}
          </p>
        )}
      </div>
      {icon && (
        <div className="p-3 bg-white/5 rounded-full text-gold-400 border border-white/5 group-hover:scale-110 transition-transform duration-500">
          {icon}
        </div>
      )}
    </div>
  );
};

export default StatCard;