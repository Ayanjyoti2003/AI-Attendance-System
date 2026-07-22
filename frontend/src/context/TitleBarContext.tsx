import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export interface TitleBarAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface TitleBarContextType {
  pageTitle: string;
  subtitle: string;
  actions: TitleBarAction[];
  setPageTitle: (title: string) => void;
  setSubtitle: (subtitle: string) => void;
  setActions: (actions: TitleBarAction[]) => void;
}

const TitleBarContext = createContext<TitleBarContextType | undefined>(undefined);

export const useTitleBar = () => {
  const context = useContext(TitleBarContext);
  if (!context) {
    throw new Error("useTitleBar must be used within a TitleBarProvider");
  }
  return context;
};

const getFallbackTitle = (pathname: string): string => {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "Dashboard"; // Fallback for root path
  
  // Take the last part of the path
  const lastPart = parts[parts.length - 1];
  
  // Check if it looks like an ID or date parameter (e.g. UUID, database ID, date format)
  const isId = /^[0-9a-fA-F-]+$/.test(lastPart) || !isNaN(Number(lastPart)) || /^\d{4}-\d{2}-\d{2}$/.test(lastPart);
  const target = (isId && parts.length > 1) ? parts[parts.length - 2] : lastPart;
  
  // Humanize the string: replace hyphens/underscores with spaces and capitalize
  return target
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const TitleBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [actions, setActions] = useState<TitleBarAction[]>([]);
  const lastPathname = useRef(location.pathname);

  // Synchronize title on location change
  useEffect(() => {
    if (lastPathname.current !== location.pathname) {
      lastPathname.current = location.pathname;
      // Reset subtitle and actions on navigation
      setSubtitle("");
      setActions([]);
      
      // Determine default title based on path
      const defaultTitle = getFallbackTitle(location.pathname);
      setPageTitle(defaultTitle);
    }
  }, [location.pathname]);

  // Initial title set on mount
  useEffect(() => {
    if (!pageTitle) {
      setPageTitle(getFallbackTitle(location.pathname));
    }
  }, []);

  return (
    <TitleBarContext.Provider
      value={{
        pageTitle,
        subtitle,
        actions,
        setPageTitle,
        setSubtitle,
        setActions,
      }}
    >
      {children}
    </TitleBarContext.Provider>
  );
};
