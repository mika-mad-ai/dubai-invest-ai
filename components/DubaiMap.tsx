
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { DistrictData } from '../types';
import { MapPinIcon, TrendingUpIcon, CheckIcon } from './Icons';

interface DubaiMapProps {
  onSelectDistrict: (districtId: string) => void;
  selectedDistrictId?: string;
}

// COORDONNÉES GPS RÉELLES DES QUARTIERS DE DUBAI
const DISTRICTS: DistrictData[] = [
  {
    id: 'palm',
    name: 'Palm Jumeirah',
    pricePerSqft: 4500,
    growthPotential: 'Medium',
    projectsCount: 12,
    paths: [
      { lat: 25.122, lng: 55.130 }, { lat: 25.100, lng: 55.115 }, { lat: 25.100, lng: 55.150 }, { lat: 25.122, lng: 55.145 }, { lat: 25.140, lng: 55.120 }
    ],
    growthJustification: [
        "Rareté foncière absolue (Île iconique)",
        "Proximité future Casino Wynn",
        "Marché Ultra-Luxe résilient"
    ]
  },
  {
    id: 'marina',
    name: 'Dubai Marina',
    pricePerSqft: 3200,
    growthPotential: 'High',
    projectsCount: 8,
    paths: [
      { lat: 25.090, lng: 55.135 }, { lat: 25.080, lng: 55.125 }, { lat: 25.065, lng: 55.130 }, { lat: 25.065, lng: 55.150 }, { lat: 25.085, lng: 55.155 }
    ],
    growthJustification: [
        "Derniers terrains constructibles",
        "Demande locative court-terme saturée",
        "Rénovation des tours historiques"
    ]
  },
  {
    id: 'downtown',
    name: 'Downtown Dubai',
    pricePerSqft: 3800,
    growthPotential: 'Medium',
    projectsCount: 5,
    paths: [
      { lat: 25.205, lng: 55.265 }, { lat: 25.190, lng: 55.260 }, { lat: 25.185, lng: 55.285 }, { lat: 25.200, lng: 55.295 }
    ],
    growthJustification: [
        "Tourism Hub mondial (Burj Khalifa)",
        "Stabilité des prix premium",
        "Extension massive du Dubai Mall"
    ]
  },
  {
    id: 'creek',
    name: 'Dubai Creek Harbour',
    pricePerSqft: 2100,
    growthPotential: 'High',
    projectsCount: 24,
    paths: [
      { lat: 25.225, lng: 55.335 }, { lat: 25.195, lng: 55.340 }, { lat: 25.190, lng: 55.365 }, { lat: 25.220, lng: 55.360 }
    ],
    growthJustification: [
        "Futur Centre-Ville de Dubaï",
        "Construction de la Creek Tower",
        "Connexion Ligne Bleue du Métro"
    ]
  },
  {
    id: 'jvc',
    name: 'Jumeirah Village Circle',
    pricePerSqft: 1200,
    growthPotential: 'High',
    projectsCount: 45,
    paths: [
      { lat: 25.075, lng: 55.195 }, { lat: 25.050, lng: 55.190 }, { lat: 25.050, lng: 55.225 }, { lat: 25.075, lng: 55.220 }
    ],
    growthJustification: [
        "Arrivée stratégique Métro Ligne Bleue",
        "Rendements locatifs les plus élevés",
        "Densification et montée en gamme"
    ]
  },
  {
    id: 'business_bay',
    name: 'Business Bay',
    pricePerSqft: 2400,
    growthPotential: 'Medium',
    projectsCount: 15,
    paths: [
      { lat: 25.185, lng: 55.255 }, { lat: 25.170, lng: 55.250 }, { lat: 25.175, lng: 55.290 }, { lat: 25.190, lng: 55.280 }
    ],
    growthJustification: [
        "Extension du Canal de Dubaï",
        "Hub d'affaires régional en croissance",
        "Spillover effect de Downtown"
    ]
  }
];

const DubaiMap: React.FC<DubaiMapProps> = ({ onSelectDistrict, selectedDistrictId }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [hoveredDistrictId, setHoveredDistrictId] = useState<string | null>(null);

  const activeDistrict = DISTRICTS.find(d => d.id === selectedDistrictId) || DISTRICTS.find(d => d.id === hoveredDistrictId);

  // Initialisation de la carte
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // 1. Init Map
    const map = L.map(mapContainerRef.current, {
      center: [25.12, 55.22], // Centré un peu mieux pour englober Palm -> Creek
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    });

    // 2. Add Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // 3. Layer Group pour les polygones (nettoyage facile)
    const layerGroup = L.layerGroup().addTo(map);
    layersRef.current = layerGroup;
    mapInstanceRef.current = map;

    // 4. Force resize (fix partial map display)
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Gestion du rendu des polygones
  useEffect(() => {
    if (!mapInstanceRef.current || !layersRef.current) return;
    
    // Nettoyer les anciens layers
    layersRef.current.clearLayers();

    DISTRICTS.forEach((district: DistrictData) => {
      const isSelected = selectedDistrictId === district.id;
      const isHovered = hoveredDistrictId === district.id;

      // Logique de couleur
      let color = '#64748b'; // Slate (Default)
      let fillColor = '#64748b';
      
      if (district.growthPotential === 'High') {
         color = '#10b981'; // Emerald
         fillColor = '#10b981';
      } else if (district.growthPotential === 'Medium') {
         color = '#eab308'; // Gold/Yellow
         fillColor = '#eab308';
      }

      if (isSelected) {
         color = '#ef4444'; // Red for selection
         fillColor = '#ef4444';
      }

      const polygon = L.polygon(district.paths.map((p: DistrictData['paths'][number]) => [p.lat, p.lng] as [number, number]), {
        color: color,
        weight: isSelected ? 3 : 1,
        opacity: 1,
        fillColor: fillColor,
        fillOpacity: isSelected ? 0.6 : (isHovered ? 0.5 : 0.25),
        className: 'transition-all duration-300' // Smooth transitions via CSS if supported by renderer
      });

      // Events
      polygon.on('click', () => onSelectDistrict(district.id));
      polygon.on('mouseover', (e) => {
        setHoveredDistrictId(district.id);
        e.target.setStyle({ fillOpacity: 0.6, weight: 2 });
      });
      polygon.on('mouseout', (e) => {
        setHoveredDistrictId(null);
        e.target.setStyle({ 
            fillOpacity: isSelected ? 0.6 : 0.25, 
            weight: isSelected ? 3 : 1 
        });
      });

      // Tooltip permanent ou hover
      polygon.bindTooltip(`
        <div class="text-center">
            <div class="font-bold text-sm">${district.name}</div>
            <div class="text-xs uppercase tracking-wider opacity-80">${district.growthPotential} Potential</div>
        </div>
      `, {
        permanent: false, // Hover only pour ne pas surcharger
        direction: "center",
        className: "bg-midnight-950/90 border border-white/10 text-white rounded px-2 py-1 shadow-xl",
        opacity: 1
      });

      layersRef.current?.addLayer(polygon);
    });

  }, [selectedDistrictId, hoveredDistrictId, onSelectDistrict]);

  return (
    <div className="w-full h-[600px] bg-[#0f172a] relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl group select-none z-0">
      
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* UI LEGEND */}
      <div className="absolute top-6 left-6 z-[400] pointer-events-none">
         <div className="bg-midnight-950/90 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-xl">
             <h3 className="text-xl font-serif text-white mb-2">Carte Interactive</h3>
             <div className="flex flex-col gap-2 text-[10px] uppercase tracking-widest font-bold">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500 border border-white/20"></span> Fort Potentiel</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-yellow-500 border border-white/20"></span> Équilibré</span>
             </div>
         </div>
      </div>

      {/* INFO PANEL */}
      <div className="absolute bottom-6 right-6 z-[400] w-80">
         {activeDistrict ? (
           <div className="glass-panel p-6 rounded-2xl border-l-4 border-gold-500 animate-fade-up shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] bg-midnight-950/95 backdrop-blur-xl">
              
              <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-2xl font-serif text-white">{activeDistrict.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                            activeDistrict.growthPotential === 'High' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 
                            activeDistrict.growthPotential === 'Medium' ? 'bg-gold-500/10 border-gold-500/30 text-gold-400' : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                        }`}>
                            Potentiel {activeDistrict.growthPotential === 'High' ? 'Élevé' : activeDistrict.growthPotential === 'Medium' ? 'Modéré' : 'Faible'}
                        </span>
                    </div>
                  </div>
                  <div className="text-right">
                      <p className="text-[9px] text-slate-400 uppercase">Prix Moyen</p>
                      <p className="text-white font-mono font-bold text-lg">{activeDistrict.pricePerSqft} <span className="text-xs font-normal text-slate-500">AED/sqft</span></p>
                  </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gold-500/50"></div>
                <p className="text-[10px] text-gold-400 uppercase font-black tracking-widest mb-3 flex items-center gap-2">
                    <TrendingUpIcon className="w-3 h-3" /> Pourquoi investir ici ?
                </p>
                <ul className="space-y-2">
                    {activeDistrict.growthJustification.map((reason: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-200 leading-snug">
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                        </li>
                    ))}
                </ul>
              </div>

              <div className="mt-4 flex justify-between text-xs text-slate-400 border-t border-white/10 pt-3">
                 <span>Nouveaux Projets : <span className="text-white font-bold">{activeDistrict.projectsCount}</span></span>
                 {selectedDistrictId === activeDistrict.id && <span className="text-gold-400 font-bold animate-pulse">● Sélectionné</span>}
              </div>

           </div>
         ) : (
           <div className="glass-panel p-4 rounded-xl opacity-90 backdrop-blur-md border border-white/10 bg-midnight-900/90 shadow-lg">
              <div className="flex items-center gap-4 text-slate-300">
                 <div className="p-2 bg-gold-500/10 rounded-full border border-gold-500/20 text-gold-400">
                    <MapPinIcon className="w-5 h-5" />
                 </div>
                 <p className="text-xs leading-relaxed">
                    Survolez une zone colorée pour voir <strong className="text-white">l'analyse IA</strong> du quartier.
                 </p>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default DubaiMap;
