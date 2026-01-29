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

  const getAnimationClass = () => {
    switch (animation) {
      case 'slide-left': return isVisible ? 'slide-left-visible' : 'slide-left-hidden';
      case 'slide-right': return isVisible ? 'slide-right-visible' : 'slide-right-hidden';
      default: return isVisible ? 'reveal-visible' : 'reveal-hidden';
    }
  };

  return (
    <div
      ref={ref}
      className={`${className} ${getAnimationClass()}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

export default ScrollReveal;