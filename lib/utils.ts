import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusion de classes Tailwind (socle shadcn / kokonut UI / bklit UI). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
