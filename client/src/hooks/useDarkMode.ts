import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('pos_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('pos_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('pos_theme', 'light');
    }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
