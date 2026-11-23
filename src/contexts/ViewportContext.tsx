import React, { createContext, useContext, useEffect, useState } from 'react';

export type ViewportMode = 'auto' | 'mobile' | 'desktop';

const VIEWPORT_STORAGE_KEY = 'stkemenag_viewport_mode';

function readInitialViewportMode(): ViewportMode {
  try {
    const saved = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'auto';
}

interface ViewportContextValue {
  viewportMode: ViewportMode;
  setViewportMode: (mode: ViewportMode) => void;
  toggleMobileDesktop: () => void;
  isNarrowScreen: boolean;
  isForcedMobile: boolean;
  isForcedDesktop: boolean;
  isMobileLayout: boolean;
}

const ViewportContext = createContext<ViewportContextValue>({
  viewportMode: 'auto',
  setViewportMode: () => {},
  toggleMobileDesktop: () => {},
  isNarrowScreen: false,
  isForcedMobile: false,
  isForcedDesktop: false,
  isMobileLayout: false,
});

export const ViewportProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [viewportMode, setViewportModeState] = useState<ViewportMode>(
    readInitialViewportMode
  );
  const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrowScreen(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const setViewportMode = (mode: ViewportMode) => {
    setViewportModeState(mode);
    try {
      localStorage.setItem(VIEWPORT_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };

  const isForcedMobile = viewportMode === 'mobile';
  const isForcedDesktop = viewportMode === 'desktop';
  const isMobileLayout =
    viewportMode === 'mobile' || (viewportMode === 'auto' && isNarrowScreen);

  const toggleMobileDesktop = () => {
    if (isMobileLayout) {
      setViewportMode(isNarrowScreen ? 'desktop' : 'auto');
    } else {
      setViewportMode(isNarrowScreen ? 'auto' : 'mobile');
    }
  };

  return (
    <ViewportContext.Provider
      value={{
        viewportMode,
        setViewportMode,
        toggleMobileDesktop,
        isNarrowScreen,
        isForcedMobile,
        isForcedDesktop,
        isMobileLayout,
      }}
    >
      {children}
    </ViewportContext.Provider>
  );
};

export function useViewport(): ViewportContextValue {
  return useContext(ViewportContext);
}
