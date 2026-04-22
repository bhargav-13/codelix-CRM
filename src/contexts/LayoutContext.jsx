import { createContext, useContext, useState } from 'react';

const LayoutContext = createContext({
  sidebarOpen: false,
  toggleSidebar: () => {},
  closeSidebar: () => {},
});

export function LayoutProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <LayoutContext.Provider value={{
      sidebarOpen,
      toggleSidebar: () => setSidebarOpen(o => !o),
      closeSidebar: () => setSidebarOpen(false),
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export const useLayout = () => useContext(LayoutContext);
