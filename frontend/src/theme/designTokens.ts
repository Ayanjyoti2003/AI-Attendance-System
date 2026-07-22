export const DESIGN_TOKENS = {
  titleBar: {
    height: 42,
    logoSize: 20,
    buttonWidth: 46,
    logoGap: 12,
    leftPadding: 16,
    animationDurationMs: 150,
    backdropBlurEnabled: false, // Optional backdrop blur, disabled by default
    theme: {
      background: "rgba(17, 24, 39, 0.95)",
      backgroundInactive: "rgba(17, 24, 39, 0.95)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
      textActive: "#F5F5F5",
      textInactive: "rgba(245, 245, 245, 0.7)", // Dimmed inactive title text
      hoverBg: "rgba(255, 255, 255, 0.08)",
      closeHoverBg: "#E81123",
      closeHoverIcon: "#FFFFFF",
    }
  }
};
