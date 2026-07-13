from typing import Dict, Any, Optional

class CameraTelemetryManager:
    """
    Manages in-memory camera telemetry data.
    These are transient values that we do not want to persist in SQL.
    """
    def __init__(self):
        # Map: camera_id (int) -> dict
        self._telemetry: Dict[int, Dict[str, Any]] = {}

    def update(self, camera_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update or merge transient telemetry data for a camera."""
        if camera_id not in self._telemetry:
            self._telemetry[camera_id] = {
                "reconnect_attempts": 0,
                "reconnect_countdown": None,
                "last_reconnect_attempt": None
            }
        
        current = self._telemetry[camera_id]
        
        # Merge new keys
        for k, v in data.items():
            current[k] = v
            
        return current

    def get(self, camera_id: int) -> Dict[str, Any]:
        """Retrieve telemetry for a camera, returning defaults if not present."""
        return self._telemetry.get(camera_id, {
            "reconnect_attempts": 0,
            "reconnect_countdown": None,
            "last_reconnect_attempt": None
        })

    def delete(self, camera_id: int) -> None:
        """Clean up telemetry when a camera is deleted, disabled, or stopped."""
        self._telemetry.pop(camera_id, None)

# Global singleton instance
telemetry_manager = CameraTelemetryManager()
