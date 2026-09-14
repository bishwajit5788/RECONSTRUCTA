"""
RECONSTRUCTA — MONGODB ATLAS METADATA LAYER
Stores project metadata, scene-graph versions, and asset references.
Large binary blobs remain in object storage; metadata is TTL protected.
"""
import os
import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    from pymongo import ASCENDING
    MOTOR_AVAILABLE = True
except ImportError:
    MOTOR_AVAILABLE = False

class ProjectVersionModel(BaseModel):
    version_id: str
    version_number: int
    name: str
    timestamp: float = Field(default_factory=time.time)
    thumbnail_object_id: Optional[str] = None
    node_count: int = 0
    schema_version: int = 1

class AssetMetadataModel(BaseModel):
    object_id: str
    project_id: str
    r2_key: str = ""
    purpose: str = "uploads"
    content_type: str
    size_bytes: int
    sha256: str
    created_at: float = Field(default_factory=time.time)
    expires_at: float

class ProjectMetadataModel(BaseModel):
    project_id: str
    owner_session: str
    name: str = "Untitled Reconstruction"
    platform: str = "generic"
    schema_version: int = 1
    canvas_width: int = 1080
    canvas_height: int = 1920
    node_count: int = 0
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    asset_ids: List[str] = Field(default_factory=list)
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    expires_at: float

class AuditEventModel(BaseModel):
    event_id: str
    session_id: str
    action: str
    timestamp: float = Field(default_factory=time.time)
    expires_at: float
    details: Dict[str, Any] = Field(default_factory=dict)

class InMemoryCollection:
    def __init__(self, name: str): self.name=name; self.docs={}
    async def create_index(self, keys: Any, **kwargs) -> str: return f"index_{self.name}"
    async def insert_one(self, doc: Dict[str, Any]) -> Any:
        doc_copy=dict(doc); _id=str(doc_copy.get("_id") or doc_copy.get("project_id") or doc_copy.get("object_id") or len(self.docs)+1); doc_copy["_id"]=_id; self.docs[_id]=doc_copy
        class Res: inserted_id=_id
        return Res()
    async def find_one(self, q: Dict[str, Any]):
        for doc in self.docs.values():
            if self._matches(doc,q):
                res=dict(doc)
                if "_id" in res: res["id"]=str(res["_id"])
                return res
        return None
    def find(self,q=None):
        q=q or {}; matches=[dict(d) for d in self.docs.values() if self._matches(d,q)]
        class Cursor:
            def __init__(self,items): self.items=items
            def __iter__(self): return iter(self.items)
            def __aiter__(self): self._iter=iter(self.items); return self
            async def __anext__(self):
                try:return next(self._iter)
                except StopIteration:raise StopAsyncIteration
            async def to_list(self,length=100): return self.items[:length]
            def __await__(self):
                async def _self():return self
                return _self().__await__()
        return Cursor(matches)
    async def update_one(self,q,update_doc,upsert=False):
        for _id,doc in self.docs.items():
            if self._matches(doc,q):
                if "$set" in update_doc:doc.update(update_doc["$set"])
                class Res: modified_count=1; upserted_id=None
                return Res()
        if upsert:
            new_doc=dict(q)
            if "$set" in update_doc:new_doc.update(update_doc["$set"])
            r=await self.insert_one(new_doc)
            class ResUpsert: modified_count=0; upserted_id=r.inserted_id
            return ResUpsert()
        class Res0: modified_count=0; upserted_id=None
        return Res0()
    async def update_many(self,q,update_doc):
        count=0
        for doc in self.docs.values():
            if self._matches(doc,q):
                if "$set" in update_doc:doc.update(update_doc["$set"])
                count+=1
        class Res: modified_count=count
        return Res()
    async def delete_one(self,q):
        for _id,doc in list(self.docs.items()):
            if self._matches(doc,q):
                del self.docs[_id]
                class Res: deleted_count=1
                return Res()
        class Res0: deleted_count=0
        return Res0()
    async def delete_many(self,q):
        count=0
        for _id,doc in list(self.docs.items()):
            if self._matches(doc,q): del self.docs[_id];count+=1
        class Res: deleted_count=count
        return Res()
    async def count_documents(self,q): return sum(1 for d in self.docs.values() if self._matches(d,q))
    def _matches(self,doc,q):
        for k,v in q.items():
            if k=="$or" and isinstance(v,list):
                if not any(all(doc.get(sk)==sv for sk,sv in sq.items()) for sq in v):return False
            elif isinstance(v,dict):
                if "$lt" in v and not(doc.get(k) is not None and doc.get(k)<v["$lt"]):return False
                if "$lte" in v and not(doc.get(k) is not None and doc.get(k)<=v["$lte"]):return False
                if "$gt" in v and not(doc.get(k) is not None and doc.get(k)>v["$gt"]):return False
            elif doc.get(k)!=v:return False
        return True

class DatabaseManager:
    def __init__(self):
        self.client=None;self.db=None;self.is_connected=False
        self.allow_local_dev=os.environ.get("LOCAL_DEV_STORAGE","true").lower() in ["true","1","yes"]
        self.is_fallback=self.allow_local_dev;self.is_healthy=self.allow_local_dev;self._memory_collections={}
    async def initialize(self):
        mongodb_uri=os.environ.get("MONGODB_URI");db_name=os.environ.get("MONGODB_DATABASE","reconstructa")
        self.allow_local_dev=os.environ.get("LOCAL_DEV_STORAGE","true").lower() in ["true","1","yes"]
        if mongodb_uri and MOTOR_AVAILABLE:
            try:
                self.client=AsyncIOMotorClient(mongodb_uri,serverSelectionTimeoutMS=2000,connectTimeoutMS=2000);self.db=self.client[db_name];await self.client.admin.command("ping");self.is_connected=True;self.is_fallback=False;self.is_healthy=True;await self._setup_ttl_indexes();return
            except Exception:
                self.is_connected=False;self.is_healthy=False
                if not self.allow_local_dev:self.is_fallback=False;return
                self.is_fallback=True
        else:
            self.is_connected=False
            if not self.allow_local_dev:self.is_healthy=False;self.is_fallback=False
            else:self.is_fallback=True;self.is_healthy=True
    def get_collection(self,name):
        if self.is_connected and self.db is not None:return self.db[name]
        if not self.allow_local_dev:raise RuntimeError("Production Database Unavailable: MongoDB Atlas connection required.")
        if name not in self._memory_collections:self._memory_collections[name]=InMemoryCollection(name)
        return self._memory_collections[name]
    async def _setup_ttl_indexes(self):
        if not self.is_connected or self.db is None:return
        for col_name in ["projects","project_versions","assets","processing_jobs","exports","sessions","audit_events"]:
            try:await self.db[col_name].create_index([("expires_at",ASCENDING)],expireAfterSeconds=0)
            except Exception:pass
        try:
            await self.db["projects"].create_index([("project_id",ASCENDING),("owner_session",ASCENDING)],unique=True)
            await self.db["assets"].create_index([("object_id",ASCENDING),("project_id",ASCENDING)],unique=True)
        except Exception:pass
    async def close(self):
        if self.client:self.client.close()

db_manager=DatabaseManager()
