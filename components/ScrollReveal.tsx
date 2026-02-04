import React, { useEffect, useRef, useState } from 'react';

type AnimationType = 'fade-up' | 'slide-left' | 'slide-right' | 'zoom-in';

interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number; // Delay in ms
  className?: string;
  animation?: AnimationType;
  threshold?: number;
}

const ScrollReveal: React.FC<ScrollRevealProps> = ({ 
  children, 
  delay = 0, 
  className = "", 
  animation = 'fade-up',
  threshold = 0.15 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: threshold,
        rootMargin: "0px 0px -50px 0px"
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [threshold]);

  // Génère les classes Tailwind dynamiquement selon l'état et le type d'animation
  const getTransformClasses = () => {
    if (!isVisible) {
        switch (animation) {
            case 'fade-up': return 'opacity-0 translate-y-8';
            case 'slide-left': return 'opacity-0 -translate-x-8';
            case 'slide-right': return 'opacity-0 translate-x-8';
            case 'zoom-in': return 'opacity-0 scale-95';
            default: return 'opacity-0';
        }
    }
    // État visible (Reset des transformations)
    return 'opacity-100 translate-y-0 translate-x-0 scale-100';
  };

  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ease-out ${getTransformClasses()} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

export default ScrollReveal;