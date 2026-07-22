import React, { useState, useEffect } from "react";
import { useTitleBar } from "../context/TitleBarContext";
import { useWindowControls } from "../hooks/useWindowControls";
import { Logo } from "./Logo";
import { WindowControls } from "./WindowControls";
import { DESIGN_TOKENS } from "../theme/designTokens";

export const AppTitleBar: React.FC = () => {
  const { pageTitle } = useTitleBar();
  const { platform, showSystemMenu } = useWindowControls();
  const [isActive, setIsActive] = useState(document.hasFocus());
  const token = DESIGN_TOKENS.titleBar;

  useEffect(() => {
    const handleFocus = () => setIsActive(true);
    const handleBlur = () => setIsActive(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    // Only trigger system menu on Windows platform
    if (platform === "win32") {
      e.preventDefault();
      showSystemMenu(e.clientX, e.clientY);
    }
  };

  const isMac = platform === "darwin";

  return (
    <header
      onContextMenu={handleContextMenu}
      className={`flex items-center justify-between select-none border-b w-full flex-shrink-0 ${
        isActive ? "window-active" : "window-inactive"
      }`}
      style={{
        height: `${token.height}px`,
        // Default inline styles acting as fallbacks in case classes aren't compiled yet
        backgroundColor: isActive ? token.theme.background : token.theme.backgroundInactive,
        borderBottom: token.theme.borderBottom,
        color: isActive ? token.theme.textActive : token.theme.textInactive,
        backdropFilter: token.backdropBlurEnabled ? "blur(8px)" : "none",
        WebkitBackdropFilter: token.backdropBlurEnabled ? "blur(8px)" : "none"
      }}
    >
      {/* Platform Aware Spacing and Brand Identity */}
      <div className="flex items-center h-full flex-shrink-0">
        {/* macOS Traffic Lights Spacer */}
        {isMac && (
          <div 
            className="h-full flex-shrink-0" 
            style={{ 
              width: "80px", 
              WebkitAppRegion: "no-drag" 
            } as any} 
          />
        )}

        {/* Logo and Spacing */}
        <div 
          className="flex items-center h-full"
          style={{ 
            paddingLeft: isMac ? "0px" : `${token.leftPadding}px`
          }}
        >
          <Logo className="flex-shrink-0" />
          
          <div style={{ width: `${token.logoGap}px` }} />

          {/* Dynamic Page Title Context */}
          <span 
            className="font-semibold select-none truncate leading-none"
            style={{ 
              fontSize: "13px",
              fontFamily: "inherit",
              WebkitAppRegion: "no-drag"
            } as any}
          >
            {pageTitle}
          </span>
        </div>
      </div>

      {/* Flexible Drag Region */}
      <div
        className="flex-1 h-full cursor-default"
        style={{ WebkitAppRegion: "drag" } as any}
      />

      {/* Window Controls (Windows / Linux only) */}
      {!isMac && <WindowControls />}
    </header>
  );
};

export default AppTitleBar;
