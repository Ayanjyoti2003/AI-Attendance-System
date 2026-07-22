import React from "react";
import logoUrl from "../assets/Logo.svg";
import { DESIGN_TOKENS } from "../theme/designTokens";

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "" }) => {
  const size = DESIGN_TOKENS.titleBar.logoSize;

  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt="App Logo"
      className={`select-none pointer-events-none ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        WebkitAppRegion: "no-drag"
      } as any}
      draggable={false}
    />
  );
};

export default Logo;
