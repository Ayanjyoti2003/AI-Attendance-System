import React from "react";
import { useWindowControls } from "../hooks/useWindowControls";
import { DESIGN_TOKENS } from "../theme/designTokens";

export const WindowControls: React.FC = () => {
  const { isMaximized, minimize, maximize, restore, close, isElectron } = useWindowControls();
  const token = DESIGN_TOKENS.titleBar;

  if (!isElectron) {
    return null;
  }

  // Keyboard navigation support: Space and Enter keys trigger action
  const handleKeyDown = (action: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div 
      className="flex items-center flex-shrink-0" 
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      {/* Minimize Button */}
      <button
        onClick={minimize}
        onKeyDown={handleKeyDown(minimize)}
        tabIndex={0}
        aria-label="Minimize Window"
        title="Minimize"
        className="flex items-center justify-center transition-colors select-none focus-visible:outline-none focus-visible:bg-white/10 text-white hover:bg-white/8 cursor-pointer"
        style={{
          width: `${token.buttonWidth}px`,
          height: `${token.height}px`,
          transitionDuration: `${token.animationDurationMs}ms`,
          transitionTimingFunction: "ease-out"
        }}
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      {/* Maximize / Restore Button */}
      <button
        onClick={isMaximized ? restore : maximize}
        onKeyDown={handleKeyDown(isMaximized ? restore : maximize)}
        tabIndex={0}
        aria-label={isMaximized ? "Restore Window" : "Maximize Window"}
        title={isMaximized ? "Restore" : "Maximize"}
        className="flex items-center justify-center transition-colors select-none focus-visible:outline-none focus-visible:bg-white/10 text-white hover:bg-white/8 cursor-pointer"
        style={{
          width: `${token.buttonWidth}px`,
          height: `${token.height}px`,
          transitionDuration: `${token.animationDurationMs}ms`,
          transitionTimingFunction: "ease-out"
        }}
      >
        {isMaximized ? (
          // Restore Icon (overlapping squares)
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
            <path d="M3 1.5H8.5V7" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        ) : (
          // Maximize Icon (single square)
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
            <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        )}
      </button>

      {/* Close Button */}
      <button
        onClick={close}
        onKeyDown={handleKeyDown(close)}
        tabIndex={0}
        aria-label="Close Window"
        title="Close"
        className="flex items-center justify-center transition-colors select-none focus-visible:outline-none focus-visible:bg-[#E81123] text-white hover:bg-[#E81123] hover:text-white cursor-pointer"
        style={{
          width: `${token.buttonWidth}px`,
          height: `${token.height}px`,
          transitionDuration: `${token.animationDurationMs}ms`,
          transitionTimingFunction: "ease-out"
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
          <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
};

export default WindowControls;
