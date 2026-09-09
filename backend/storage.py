"""
RECONSTRUCTA — CLOUDFLARE R2 TEMPORARY OBJECT STORAGE
S3-compatible client for temporary file uploads, intermediate working renders, and exports.
Enforces cryptographically random object keys, strict 2-hour expiration, and zero content logging.
"""

import hashlib
import os
import time
import uuid
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB security limit
DEFAULT_RETENTION_SECONDS = 7200  # 2 Hours


class StoredObjectMetadata(BaseModel):
    object_id: str
    project_id: str
    key: str  # R2 S3 Key, e.g. "uploads/c8a9f.../file"
    purpose: str  # "uploads" | "working" | "exports"
    content_type: str
    size: int
    sha256: str
    created_at: float = Field(default_factory=time.time)
    expires_at: float


class StorageManager:
    """Manages Cloudflare R2 object storage with in-memory/local disk fallback."""

    def __init__(self):
        self.r2_account_id = os.environ.get("R2_ACCOUNT_ID")
        self.r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
        self.r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        self.r2_bucket = os.environ.get("R2_BUCKET", "reconstructa-temp")
        self.r2_endpoint = os.environ.get("R2_ENDPOINT")

        if not self.r2_endpoint and self.r2_account_id:
            self.r2_endpoint = f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

        self.s3_client = None
        self.is_r2_active = False
        self._local_storage: Dict[str, Tuple[bytes, StoredObjectMetadata]] = {}

        self._initialize_s3()

    def _initialize_s3(self):
        if BOTO3_AVAILABLE and self.r2_access_key and self.r2_secret_key and self.r2_endpoint:
            try:
                self.s3_client = boto3.client(
                    "s3",
                    endpoint_url=self.r2_endpoint,
                    aws_access_key_id=self.r2_access_key,
                    aws_secret_access_key=self.r2_secret_key,
                    config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"})
                )
                self.is_r2_active = True
            except Exception:
                self.is_r2_active = False
                self.s3_client = None
        else:
            self.is_r2_active = False

    def upload_file(
        self,
        data: bytes,
        project_id: str,
        purpose: str = "uploads",
        content_type: str = "application/octet-stream",
        ttl_seconds: int = DEFAULT_RETENTION_SECONDS
    ) -> StoredObjectMetadata:
        """
        Stores a file in Cloudflare R2 (or local fallback) under a cryptographically random object key.
        Computes SHA-256 and sets absolute 2-hour expiration.
        """
        if len(data) > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"Payload size ({len(data)} bytes) exceeds the 50MB safety limit.")

        sha256_hash = hashlib.sha256(data).hexdigest()
        now = time.time()
        expires_at = now + ttl_seconds

        # Sanitize purpose category to uploads | working | exports
        normalized_purpose = "uploads"
        if purpose in ["working", "exports", "uploads"]:
            normalized_purpose = purpose

        # Cryptographically random key — NEVER use the original user filename
        random_id = uuid.uuid4().hex
        object_key = f"{normalized_purpose}/{random_id}"

        metadata = StoredObjectMetadata(
            object_id=random_id,
            project_id=project_id,
            key=object_key,
            purpose=normalized_purpose,
            content_type=content_type,
            size=len(data),
            sha256=sha256_hash,
            created_at=now,
            expires_at=expires_at
        )

        if self.is_r2_active and self.s3_client is not None:
            try:
                self.s3_client.put_object(
                    Bucket=self.r2_bucket,
                    Key=object_key,
                    Body=data,
                    ContentType=content_type,
                    Metadata={
                        "project_id": project_id,
                        "sha256": sha256_hash,
                        "expires_at": str(expires_at),
                        "purpose": normalized_purpose
                    }
                )
                # Keep local index of metadata for fast expiration sweeping
                self._local_storage[random_id] = (b"", metadata)
                return metadata
            except Exception as r2_err:
                # Log non-sensitive failure and fallback
                pass

        # Local storage fallback
        self._local_storage[random_id] = (data, metadata)
        return metadata

    def download_file(self, object_id: str) -> Optional[Tuple[bytes, StoredObjectMetadata]]:
        """Downloads a temporary file if it exists and has not expired."""
        if object_id not in self._local_storage:
            return None

        data, meta = self._local_storage[object_id]

        # Check if already expired
        if time.time() > meta.expires_at:
            self.delete_file(object_id)
            return None

        if self.is_r2_active and self.s3_client is not None:
            try:
                response = self.s3_client.get_object(Bucket=self.r2_bucket, Key=meta.key)
                file_bytes = response["Body"].read()
                return file_bytes, meta
            except Exception:
                return None

        return data, meta

    def delete_file(self, object_id: str) -> bool:
        """Immediately purges a temporary file from R2 and memory."""
        if object_id not in self._local_storage:
            return False

        _, meta = self._local_storage.pop(object_id)

        if self.is_r2_active and self.s3_client is not None:
            try:
                self.s3_client.delete_object(Bucket=self.r2_bucket, Key=meta.key)
            except Exception:
                pass

        return True

    def check_exists(self, object_id: str) -> bool:
        """Checks if a valid, unexpired object exists."""
        if object_id not in self._local_storage:
            return False
        _, meta = self._local_storage[object_id]
        if time.time() > meta.expires_at:
            self.delete_file(object_id)
            return False
        return True

    def purge_expired_objects(self, current_time: Optional[float] = None) -> int:
        """Sweeps and deletes all objects whose expiration time has elapsed."""
        now = current_time or time.time()
        expired_ids = [
            obj_id for obj_id, (_, meta) in self._local_storage.items()
            if meta.expires_at <= now
        ]
        purged = 0
        for obj_id in expired_ids:
            if self.delete_file(obj_id):
                purged += 1
        return purged


# Global Storage Singleton
storage_manager = StorageManager()
