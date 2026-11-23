import React from 'react';
import { Eye, Moon, Sun } from 'lucide-react';

export type ThemeMode = 'normal' | 'night' | 'dark';

export const THEME_STORAGE_KEY = 'stkemenag_theme_mode';

export function readInitialThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'night' || saved === 'dark' || saved === 'normal') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'normal';
}

export function applyThemeModeToDom(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark', 'theme-night');
  if (mode === 'dark') {
    root.classList.add('dark');
  } else if (mode === 'night') {
    root.classList.add('theme-night');
  }
  root.setAttribute('data-theme', mode);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

interface ThemeSwitcherProps {
  themeMode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  shortLabel: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'normal',
    label: 'Normal',
    shortLabel: 'Normal',
    title: 'Mode Normal — Terang standar bersih',
    Icon: Sun,
  },
  {
    id: 'night',
    label: 'Night Light',
    shortLabel: 'Night',
    title: 'Mode Night Light — Hangat ramah mata (filter cahaya biru rendah)',
    Icon: Eye,
  },
  {
    id: 'dark',
    label: 'Dark',
    shortLabel: 'Dark',
    title: 'Mode Dark — Gelap modern',
    Icon: Moon,
  },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  themeMode,
  onChange,
}) => {
  return (
    <div
      role="group"
      aria-label="Pengaturan tema tampilan"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border st-surface-muted shrink-0"
    >
      {THEME_OPTIONS.map(({ id, label, shortLabel, title, Icon }) => {
        const active = themeMode === id;
        return (
          <button
            key={id}
            type="button"
            title={title}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              active
                ? id === 'night'
                  ? 'bg-[#fdf6e3] text-[#3b3228] shadow-xs border border-[#d3c096]'
                  : id === 'dark'
                    ? 'bg-slate-800 text-slate-100 shadow-xs border border-slate-600'
                    : 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 night:text-[#6b5a46] dark:text-slate-400 hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100 border border-transparent'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{label}</span>
            <span className="hidden sm:inline xl:hidden">{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};
