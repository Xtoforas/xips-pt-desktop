import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const useScrollToHash = (): void => {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      return;
    }
    const targetId = location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);
};
