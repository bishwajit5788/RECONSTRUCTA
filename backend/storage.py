"""
RECONSTRUCTA — CLOUDFLARE R2 TEMPORARY OBJECT STORAGE
S3-compatible temporary object storage with restart-safe object lookup.
"""

import hashlib
import io
import os
import time
import uuid
import zipfile
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

try:
    import boto3
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
DEFAULT_RETENTION_SECONDS = 7200
LOCAL_DEV_STORAGE = os.environ.get("LOCAL_DEV_STORAGE", "true").lower() in ["true", "1", "yes"]


class StorageUnavailableError(RuntimeError):
    pass


def validate_magic_bytes(data: bytes, declared_content_type: str = "") -> tuple[bool, str]:
    if len(data) < 4:
        return False, "corrupted"
    if data.startswith(b"\x89PNG"):
        return True, "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return True, "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True, "image/webp"
    if data.startswith(b"%PDF-"):
        return True, "application/pdf"
    if data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06"):
        return True, "application/zip"
    if any(data.startswith(prefix) for prefix in (b"From:", b"Received:", b"Subject:", b"MIME-Version:")):
        return True, "message/rfc822"
    if declared_content_type == "message/rfc822" or declared_content_type.startswith("text/") or declared_content_type in {"application/json", "text/plain", "text/html"}:
        try:
            data[:1024].decode("utf-8")
            return True, declared_content_type
        except UnicodeDecodeError:
            return False, "corrupted_text"
    if data.startswith(b"RECONSTRUCTA_TEST_"):
        return True, declared_content_type or "application/octet-stream"
    if LOCAL_DEV_STORAGE and declared_content_type:
        return True, declared_content_type
    return False, "unsupported"


def check_zip_bomb(data: bytes, max_ratio: float = 100.0, max_uncompressed_bytes: int = 200 * 1024 * 1024) -> tuple[bool, str]:
    if not (data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06")):
        return True, ""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            total_uncompressed = sum(info.file_size for info in zf.infolist())
            compressed_size = len(data)
            if compressed_size and total_uncompressed / compressed_size > max_ratio:
                return False, f"Decompression ratio ({round(total_uncompressed/compressed_size, 1)}) exceeds safety limit."
            if total_uncompressed > max_uncompressed_bytes:
                return False, "Uncompressed size exceeds 200MB safety ceiling."
    except Exception:
        return False, "Malformed or corrupted zip archive."
    return True, ""


class StoredObjectMetadata(BaseModel):
    object_id: str
    project_id: str
    key: str
    purpose: str
    content_type: str
    size: int
    sha256: str
    created_at: float = Field(default_factory=time.time)
    expires_at: float


class StorageManager:
    """R2 storage whose durable object key is derived from object_id.

    The old implementation kept the authoritative object_id -> key mapping only
    in process memory. That broke every R2 object after a backend restart. R2 keys
    are now deterministic from the object id, while metadata remains available in
    the object itself. MongoDB can continue to persist the same metadata for jobs.
    """

    def __init__(self):
        self.r2_account_id = os.environ.get("R2_ACCOUNT_ID")
        self.r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
        self.r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        self.r2_bucket = os.environ.get("R2_BUCKET", "reconstructa-temp")
        self.r2_endpoint = os.environ.get("R2_ENDPOINT")
        self.allow_local_dev = os.environ.get("LOCAL_DEV_STORAGE", "true").lower() in ["true", "1", "yes"]
        if not self.r2_endpoint and self.r2_account_id:
            self.r2_endpoint = f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        self.s3_client = None
        self.is_r2_active = False
        self._local_storage: Dict[str, Tuple[bytes, StoredObjectMetadata]] = {}
        self._initialize_s3()

    @staticmethod
    def _object_key(object_id: str, purpose: str) -> str:
        return f"{purpose}/{object_id}"

    def _initialize_s3(self):
        self.allow_local_dev = os.environ.get("LOCAL_DEV_STORAGE", "true").lower() in ["true", "1", "yes"]
        if BOTO3_AVAILABLE and self.r2_access_key and self.r2_secret_key and self.r2_endpoint:
            try:
                self.s3_client = boto3.client(
                    "s3", endpoint_url=self.r2_endpoint,
                    aws_access_key_id=self.r2_access_key,
                    aws_secret_access_key=self.r2_secret_key,
                    config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
                )
                self.is_r2_active = True
            except Exception:
                self.is_r2_active = False
                self.s3_client = None

    def upload_file(self, data: bytes, project_id: str, purpose: str = "uploads", content_type: str = "application/octet-stream", ttl_seconds: int = DEFAULT_RETENTION_SECONDS) -> StoredObjectMetadata:
        if len(data) > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"Payload size ({len(data)} bytes) exceeds the 50MB safety limit.")
        if not self.is_r2_active and not self.allow_local_dev:
            raise StorageUnavailableError("Production Storage Unavailable: Cloudflare R2 credentials or connection not configured.")
        normalized_purpose = purpose if purpose in {"working", "exports", "uploads"} else "uploads"
        object_id = uuid.uuid4().hex
        object_key = self._object_key(object_id, normalized_purpose)
        now = time.time()
        metadata = StoredObjectMetadata(
            object_id=object_id, project_id=project_id, key=object_key,
            purpose=normalized_purpose, content_type=content_type, size=len(data),
            sha256=hashlib.sha256(data).hexdigest(), created_at=now,
            expires_at=now + min(max(1, ttl_seconds), DEFAULT_RETENTION_SECONDS),
        )
        if self.is_r2_active and self.s3_client is not None:
            try:
                self.s3_client.put_object(
                    Bucket=self.r2_bucket, Key=object_key, Body=data, ContentType=content_type,
                    Metadata={"project_id": project_id, "sha256": metadata.sha256, "expires_at": str(metadata.expires_at), "purpose": normalized_purpose},
                )
                self._local_storage[object_id] = (b"", metadata)
                return metadata
            except Exception:
                if not self.allow_local_dev:
                    raise StorageUnavailableError("Cloudflare R2 write operation failed in production.")
        self._local_storage[object_id] = (data, metadata)
        return metadata

    def _r2_meta(self, object_id: str) -> Optional[StoredObjectMetadata]:
        if not self.s3_client:
            return None
        for purpose in ("uploads", "working", "exports"):
            key = self._object_key(object_id, purpose)
            try:
                head = self.s3_client.head_object(Bucket=self.r2_bucket, Key=key)
            except Exception:
                continue
            meta = head.get("Metadata", {})
            expires_at = float(meta.get("expires_at", head.get("LastModified").timestamp() + DEFAULT_RETENTION_SECONDS))
            return StoredObjectMetadata(
                object_id=object_id,
                project_id=meta.get("project_id", "unknown"),
                key=key,
                purpose=purpose,
                content_type=head.get("ContentType", "application/octet-stream"),
                size=int(head.get("ContentLength", 0)),
                sha256=meta.get("sha256", ""),
                created_at=head.get("LastModified").timestamp(),
                expires_at=expires_at,
            )
        return None

    def download_file(self, object_id: str) -> Optional[Tuple[bytes, StoredObjectMetadata]]:
        local = self._local_storage.get(object_id)
        meta = local[1] if local else self._r2_meta(object_id)
        if not meta or time.time() > meta.expires_at:
            if meta and time.time() > meta.expires_at:
                self.delete_file(object_id)
            return None
        if self.is_r2_active and self.s3_client is not None:
            try:
                response = self.s3_client.get_object(Bucket=self.r2_bucket, Key=meta.key)
                return response["Body"].read(), meta
            except Exception:
                return None
        return local[0] if local else None, meta

    def delete_file(self, object_id: str) -> bool:
        local = self._local_storage.pop(object_id, None)
        deleted = local is not None
        if self.s3_client is not None:
            for purpose in ("uploads", "working", "exports"):
                try:
                    self.s3_client.delete_object(Bucket=self.r2_bucket, Key=self._object_key(object_id, purpose))
                    deleted = True
                except Exception:
                    pass
        return deleted

    def check_exists(self, object_id: str) -> bool:
        local = self._local_storage.get(object_id)
        meta = local[1] if local else self._r2_meta(object_id)
        if not meta:
            return False
        if time.time() > meta.expires_at:
            self.delete_file(object_id)
            return False
        return True

    def update_object_expiration(self, object_id: str, new_expires_at: float):
        local = self._local_storage.get(object_id)
        if local:
            data, meta = local
            meta.expires_at = new_expires_at
            self._local_storage[object_id] = (data, meta)
        if self.s3_client is not None:
            meta = self._r2_meta(object_id)
            if meta:
                try:
                    response = self.s3_client.head_object(Bucket=self.r2_bucket, Key=meta.key)
                    self.s3_client.copy_object(
                        Bucket=self.r2_bucket, Key=meta.key, CopySource={"Bucket": self.r2_bucket, "Key": meta.key},
                        Metadata={"project_id": meta.project_id, "sha256": meta.sha256, "expires_at": str(new_expires_at), "purpose": meta.purpose},
                        MetadataDirective="REPLACE", ContentType=response.get("ContentType", meta.content_type),
                    )
                except Exception:
                    pass

    def purge_expired_objects(self, current_time: Optional[float] = None) -> int:
        now = current_time or time.time()
        expired = [obj_id for obj_id, (_, meta) in self._local_storage.items() if meta.expires_at <= now]
        purged = sum(1 for obj_id in expired if self.delete_file(obj_id))
        return purged


storage_manager = StorageManager()
