"""
Background backup scheduler using threading.Timer.

No external dependencies (APScheduler, etc.).

Lifecycle:
    1. On application start, BackupScheduler.start() is called.
    2. Reads backup settings from ConfigurationManager.
    3. If automatic backup is enabled, starts a background timer loop.
    4. Each tick checks whether the current time matches backup_time.
    5. When matched, creates a backup and enforces retention policy.
    6. On application shutdown, BackupScheduler.stop() is called.
"""

import os
import threading
import time
from datetime import datetime

_CHECK_INTERVAL_SECONDS = 60  # Check every 60 seconds


class BackupScheduler:
    """Simple background scheduler for automatic backups."""

    def __init__(self) -> None:
        self._timer: threading.Timer | None = None
        self._running = False
        self._lock = threading.Lock()
        self._last_backup_date: str | None = None  # "YYYY-MM-DD"

    # ── Public API ───────────────────────────────────────────

    def start(self) -> None:
        """Start the scheduler if automatic backups are enabled."""
        from backend.config import config_manager

        config = config_manager.get_config()

        if not config.backup.enabled or not config.backup.automatic:
            print("[SCHEDULER] Automatic backups are disabled.")
            return

        with self._lock:
            if self._running:
                return
            self._running = True

        print(
            f"[SCHEDULER] Started — "
            f"frequency={config.backup.frequency}, "
            f"time={config.backup.backup_time}, "
            f"keep={config.backup.keep}"
        )
        self._schedule_next()

    def stop(self) -> None:
        """Stop the scheduler."""
        with self._lock:
            self._running = False
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

        print("[SCHEDULER] Stopped.")

    def restart(self) -> None:
        """Restart the scheduler (e.g. after settings change)."""
        self.stop()
        self.start()

    @property
    def is_running(self) -> bool:
        return self._running

    # ── Internals ────────────────────────────────────────────

    def _schedule_next(self) -> None:
        """Schedule the next check tick."""
        with self._lock:
            if not self._running:
                return

            self._timer = threading.Timer(
                _CHECK_INTERVAL_SECONDS,
                self._tick,
            )
            self._timer.daemon = True
            self._timer.start()

    def _tick(self) -> None:
        """Periodic tick — check if it's time to run a backup."""
        if not self._running:
            return

        try:
            self._check_and_backup()
        except Exception as e:
            print(f"[SCHEDULER] Error during scheduled backup: {e}")

        # Schedule next tick
        self._schedule_next()

    def _check_and_backup(self) -> None:
        """Check schedule and run backup if appropriate."""
        from backend.config import config_manager

        config = config_manager.get_config()

        if not config.backup.enabled or not config.backup.automatic:
            return

        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")

        # Parse configured backup time
        try:
            hour, minute = map(int, config.backup.backup_time.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 2, 0  # Default to 02:00

        # Check if current time is within the backup window
        if now.hour != hour or now.minute < minute or now.minute > minute + 1:
            return

        # Check frequency
        if not self._should_run_today(config.backup.frequency, now):
            return

        # Prevent duplicate backups on the same day
        if self._last_backup_date == today_str:
            return

        print(f"[SCHEDULER] Running scheduled backup at {now.isoformat()}")
        self._last_backup_date = today_str

        # Create backup
        from backend.backup.manager import BackupManager

        manager = BackupManager()
        result = manager.create_backup(username="scheduler")

        if result.status == "success":
            print(f"[SCHEDULER] Backup created: {result.file}")
            # Enforce retention policy
            self._enforce_retention(manager, config.backup.keep)
        else:
            print(f"[SCHEDULER] Backup failed: {result.message}")

    @staticmethod
    def _should_run_today(frequency: str, now: datetime) -> bool:
        """Determine if a backup should run today based on frequency."""
        if frequency == "daily":
            return True
        elif frequency == "weekly":
            return now.weekday() == 0  # Monday
        elif frequency == "monthly":
            return now.day == 1  # First day of month
        return False

    @staticmethod
    def _enforce_retention(manager, keep: int) -> None:
        """Delete old backups beyond the retention limit.

        Args:
            manager: BackupManager instance.
            keep: Maximum number of backups to retain.
        """
        if keep <= 0:
            return

        backups = manager.list_backups()

        # Sort by filename (which contains timestamp) — newest first
        backups.sort(key=lambda b: b.filename, reverse=True)

        # Skip safety backups from deletion
        regular_backups = [
            b for b in backups
            if not b.filename.startswith("pre_restore_")
        ]

        if len(regular_backups) <= keep:
            return

        for old_backup in regular_backups[keep:]:
            try:
                manager.delete_backup(old_backup.filename, username="scheduler")
                print(f"[SCHEDULER] Retention: deleted {old_backup.filename}")
            except Exception as e:
                print(f"[SCHEDULER] Retention: failed to delete {old_backup.filename}: {e}")
