"""
backend.config — Centralized Configuration Management

All application configuration flows through this package.
No other module should read config files directly.
"""

from backend.config.manager import ConfigurationManager

# Singleton instance — import this from anywhere
config_manager = ConfigurationManager()

__all__ = ["config_manager", "ConfigurationManager"]
