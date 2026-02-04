
export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export type PropertyStatus = 'ready' | 'off-plan';

export interface UserProfile {
  name: string;
  email: string;
  totalBudget: string;
  initialInvestment: string;
  monthlyContribution: string;
  duration: string;
  // Nouveaux critères
  propertyStatus: PropertyStatus;
  riskLevel: number; // 1 à 5
  roiDelay: string; // Mois avant revenus
}

export type RentalStrategy = 'long_term' | 'short_term';

export interface Property {
  id: string;
  title: string;
  location: string;
  price: number;
  yield: number;
  type: string;
  image: string;
  beds: number;
  baths: number;
  sqm: number;
  completion: string;
}

export interface SimulationParams {
  rentalYield: number;
  appreciation: number;
  exchangeRate: number;
  occupancy: number;
  duration: number;
  strategy: RentalStrategy;
  riskTolerance: number;
  selectedPropertyId?: string;
}

export interface DistrictPath {
  lat: number;
  lng: number;
}

export interface DistrictData {
  id: string;
  name: string;
  pricePerSqft: number;
  growthPotential: 'High' | 'Medium' | 'Low';
  projectsCount: number;
  paths: DistrictPath[];
  growthJustification: string[];
}

export interface ChartDataPoint {
  year: string;
  investedAmount: number;
  scenarioOptimiste: number;
  dubaiRange: [number, number];
  scenarioFrance: number;
  franceRange: [number, number];
  [key: string]: any;
}

export interface CashflowDataPoint {
  name: string;
  value: number;
  type: 'income' | 'expense';
  details?: string;
  [key: string]: any;
}

export interface CostDataPoint {
  name: string;
  value: number;
  fill: string;
  [key: string]: any;
}

export interface ExchangeRateDataPoint {
  year: string;
  rate: number;
  low: number;
  high: number;
}
