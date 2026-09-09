"""
RECONSTRUCTA — TWO-HOUR DATA RETENTION & CLEANUP ENGINE
Enforces strict 2-hour deletion on temporary files, intermediate artifacts, and project metadata.
Every upload, modification, or export operation extends the project's lifetime by 2 hours.
"""

import asyncio
import time
from typing import Dict, Any, Optional
from database import db_manager
from storage import storage_manager

RETENTION_WINDOW_SECONDS = 7200  # Exactly 2 Hours


class RetentionWorker:
    """Background task and utilities for managing 2-hour object and metadata expiration."""

    def __init__(self, interval_seconds: int = 60):
        self.interval_seconds = interval_seconds
        self._is_running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Starts the recurring cleanup background loop."""
        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        """Cancels and stops the background cleanup worker."""
        self._is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _cleanup_loop(self):
        while self._is_running:
            try:
                await self.purge_all_expired()
            except Exception:
                # Log without content details
                pass
            await asyncio.sleep(self.interval_seconds)

    async def purge_all_expired(self, reference_time: Optional[float] = None) -> Dict[str, int]:
        """
        Purges expired files from Cloudflare R2 and deletes expired metadata records from MongoDB.
        Never logs document or file contents.
        """
        now = reference_time or time.time()

        # 1. Purge R2 Temporary Files
        purged_files = storage_manager.purge_expired_objects(now)

        # 2. Purge MongoDB Metadata collections
        purged_metadata: Dict[str, int] = {"files": purged_files}
        collections_to_clean = ["projects", "assets", "project_versions", "sessions", "audit_events"]

        for col_name in collections_to_clean:
            col = db_manager.get_collection(col_name)
            try:
                res = await col.delete_many({"expires_at": {"$lte": now}})
                purged_metadata[col_name] = getattr(res, "deleted_count", 0)
            except Exception:
                purged_metadata[col_name] = 0

        return purged_metadata

    @staticmethod
    def calculate_new_expiration(base_time: Optional[float] = None) -> float:
        """Returns current timestamp + 2 hours (7200 seconds)."""
        now = base_time or time.time()
        return now + RETENTION_WINDOW_SECONDS

    @staticmethod
    async def extend_project_retention(project_id: str) -> float:
        """
        Updates the expiration of a project and all associated temporary assets
        to 2 hours from now upon any successful edit or export.
        """
        new_expiry = RetentionWorker.calculate_new_expiration()
        now = time.time()

        # Update Project metadata in DB
        projects_col = db_manager.get_collection("projects")
        await projects_col.update_one(
            {"project_id": project_id},
            {"$set": {"updated_at": now, "expires_at": new_expiry}}
        )

        # Update associated assets in DB
        assets_col = db_manager.get_collection("assets")
        await assets_col.update_one(
            {"project_id": project_id},
            {"$set": {"expires_at": new_expiry}}
        )

        return new_expiry


# Global Singleton Worker
retention_worker = RetentionWorker(interval_seconds=60)
