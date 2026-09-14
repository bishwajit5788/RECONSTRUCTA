"""RECONSTRUCTA production FastAPI backend with project/asset authorization."""
import base64, io, logging, os, time, uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Dict, List, Literal, Optional, Any
import cv2, numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from auth import authenticate_user, create_session, create_user, revoke_session
from authz import ensure_owner_not_forged, principal_from_request, require_asset_owner, require_project_owner
from database import db_manager, ProjectMetadataModel, AssetMetadataModel
from storage import storage_manager, StoredObjectMetadata, MAX_FILE_SIZE_BYTES, validate_magic_bytes, check_zip_bomb, LOCAL_DEV_STORAGE
from retention import retention_worker, RETENTION_WINDOW_SECONDS
logger=logging.getLogger("reconstructa.api");logging.basicConfig(level=logging.INFO,format="%(asctime)s [%(levelname)s] %(message)s")
@asynccontextmanager
async def lifespan(app:FastAPI):
    await db_manager.initialize();retention_worker.start();yield;await retention_worker.stop();await db_manager.close()
app=FastAPI(title="RECONSTRUCTA Production Backend Service",description="Secure visual reconstruction backend with real credential authentication and ownership enforcement.",version="2.3.0",lifespan=lifespan)
cors_origins_env=os.environ.get("CORS_ORIGINS","*");allowed_origins=[x.strip() for x in cors_origins_env.split(",") if x.strip()] if cors_origins_env!="*" else ["*"]
app.add_middleware(CORSMiddleware,allow_origins=allowed_origins,allow_credentials=True,allow_methods=["GET","POST","DELETE","OPTIONS"],allow_headers=["Authorization","Content-Type","X-Request-ID"])
_rate_limits:Dict[str,List[float]]=defaultdict(list);RATE_LIMIT_WINDOW=60.;RATE_LIMIT_MAX_REQUESTS=180
@app.middleware("http")
async def observability_and_rate_limit_middleware(request:Request,call_next):
    req_id=request.headers.get("X-Request-ID") or str(uuid.uuid4());start=time.time();client_ip=request.client.host if request.client else "127.0.0.1";now=time.time();timestamps=[t for t in _rate_limits[client_ip] if now-t<RATE_LIMIT_WINDOW]
    if len(timestamps)>=RATE_LIMIT_MAX_REQUESTS:return Response(content='{"detail":"Rate limit exceeded. Try again later."}',status_code=429,media_type="application/json",headers={"X-Request-ID":req_id})
    timestamps.append(now);_rate_limits[client_ip]=timestamps;response=await call_next(request);response.headers["X-Request-ID"]=req_id;response.headers["X-Content-Type-Options"]="nosniff";response.headers["X-Frame-Options"]="DENY";logger.info("REQ %s | %s %s -> %s (%.2fms)",req_id,request.method,request.url.path,response.status_code,(time.time()-start)*1000);return response
class BoundingBoxModel(BaseModel):
    x:int=Field(ge=0);y:int=Field(ge=0);width:int=Field(gt=0);height:int=Field(gt=0)
class InpaintRequest(BaseModel):
    image_data:str;bounds:BoundingBoxModel;algorithm:Literal["telea","ns"]="telea";inpaint_radius:int=Field(default=3,ge=1,le=15)
class InpaintResponse(BaseModel):
    status:str;algorithm_used:str;restored_image_data:str;quality_score:float;quality_label:Literal["excellent","good","acceptable","poor","failed"];warnings:List[str];processing_time_ms:float
class ProjectCreateRequest(BaseModel):
    project_id:str=Field(min_length=1,max_length=128);owner_session:Optional[str]=Field(default=None,max_length=256);name:str=Field(default="Untitled Reconstruction",max_length=256);platform:str=Field(default="generic",max_length=64);schema_version:int=1;canvas_width:int=Field(default=1080,gt=0,le=20000);canvas_height:int=Field(default=720,gt=0,le=20000);node_count:int=Field(default=0,ge=0);nodes:List[Dict[str,Any]]=Field(default_factory=list,max_length=10000)
class CredentialRequest(BaseModel): username:str=Field(min_length=3,max_length=64);password:str=Field(min_length=1,max_length=256)
class AuthResponse(BaseModel): access_token:str;token_type:Literal["bearer"]="bearer";expires_at:float;user_id:str;username:str

def calculate_inpaint_quality(original_bgr,restored_bgr,mask,bounds):
    warnings=[];h,w,_=original_bgr.shape;kernel=cv2.getStructuringElement(cv2.MORPH_RECT,(5,5));dilated=cv2.dilate(mask,kernel,iterations=1);ring=cv2.bitwise_xor(dilated,mask);og=cv2.cvtColor(original_bgr,cv2.COLOR_BGR2GRAY);rg=cv2.cvtColor(restored_bgr,cv2.COLOR_BGR2GRAY);lo=cv2.Laplacian(og,cv2.CV_32F);lr=cv2.Laplacian(rg,cv2.CV_32F);p=ring>0;ge=float(np.mean(np.abs(lo[p]-lr[p]))) if np.any(p) else 0.;cd=float(np.mean(np.abs(original_bgr[p].astype(np.float32)-restored_bgr[p].astype(np.float32)))) if np.any(p) else 0.;bx,by,bw,bh=bounds.x,bounds.y,bounds.width,bounds.height;sw,sh=min(bw,w-bx),min(bh,h-by);patch=rg[by:by+sh,bx:bx+sw];rv=float(np.var(patch)) if patch.size else 100.;ratio=(bw*bh)/(w*h);score=float(np.clip(round(1.-min(.35,ge/80.)-min(.35,cd/50.)-min(.20,ratio*.8),2),.10,.99));label="excellent" if score>=.90 else "good" if score>=.75 else "acceptable" if score>=.60 else "poor" if score>=.40 else "failed";warnings += ["Perimeter gradient discontinuity detected."] if ge>25 else [];warnings += ["Perimeter color transition deviates from background context."] if cd>18 else [];warnings += ["Large inpainting area; structural smoothing may be perceptible."] if ratio>.15 else [];warnings += ["Flat region synthesized inside high-frequency context."] if rv<5 and ge>15 else [];return score,label,warnings
@app.get("/api/health")
async def health_check():return {"status":"ok","service":"RECONSTRUCTA Production Engine","mode":"production_hardened","opencv_version":cv2.__version__,"mongodb_connected":db_manager.is_connected,"mongodb_fallback":db_manager.is_fallback,"r2_active":storage_manager.is_r2_active,"retention_hours":2,"retention_seconds":RETENTION_WINDOW_SECONDS,"timestamp":time.time()}
@app.get("/api/ready")
async def readiness_check():
    db_ok=db_manager.is_healthy;storage_ok=storage_manager.is_r2_active or LOCAL_DEV_STORAGE
    if not db_ok or not storage_ok:raise HTTPException(status_code=503,detail={"status":"degraded","database_healthy":db_ok,"storage_healthy":storage_ok,"local_dev_mode":LOCAL_DEV_STORAGE})
    return {"status":"ready","database_healthy":True,"storage_healthy":True,"local_dev_mode":LOCAL_DEV_STORAGE,"timestamp":time.time()}
@app.post("/api/auth/register",response_model=AuthResponse)
async def register(request:CredentialRequest):
    uid=await create_user(request.username,request.password);user={"user_id":uid,"username":request.username.strip().lower()};token,expires=await create_session(user);return AuthResponse(access_token=token,expires_at=expires,user_id=uid,username=user["username"])
@app.post("/api/auth/login",response_model=AuthResponse)
async def login(request:CredentialRequest):
    user=await authenticate_user(request.username,request.password);token,expires=await create_session(user);return AuthResponse(access_token=token,expires_at=expires,user_id=user["user_id"],username=user["username"])
@app.post("/api/auth/logout")
async def logout(request:Request):await revoke_session(request);return {"status":"success"}
@app.get("/api/auth/me")
async def current_user(request:Request):
    principal=await principal_from_request(request);user=await db_manager.get_collection("users").find_one({"user_id":principal})
    if not user:raise HTTPException(status_code=401,detail="Authenticated user no longer exists")
    return {"user_id":user["user_id"],"username":user["username"]}
@app.post("/api/inpaint",response_model=InpaintResponse)
async def inpaint_region(req:InpaintRequest):
    start=time.time()
    try:
        _,encoded=req.image_data.split(",",1) if "," in req.image_data else ("",req.image_data);raw=base64.b64decode(encoded,validate=True)
        if len(raw)>MAX_FILE_SIZE_BYTES:raise HTTPException(status_code=413,detail="Payload exceeds 50MB security limit.")
        img=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
    except HTTPException:raise
    except Exception:raise HTTPException(status_code=400,detail="Invalid image payload provided.")
    h,w,_=img.shape
    if h*w>16777216:raise HTTPException(status_code=400,detail="Image exceeds maximum allowable pixel dimensions (16MP).")
    bx,by,bw,bh=req.bounds.x,req.bounds.y,req.bounds.width,req.bounds.height
    if bx>=w or by>=h:raise HTTPException(status_code=400,detail="Bounding box coordinates are out of image bounds.")
    sw,sh=min(bw,w-bx),min(bh,h-by);mask=np.zeros((h,w),dtype=np.uint8);mask[by:by+sh,bx:bx+sw]=255
    try:restored=cv2.inpaint(img,mask,req.inpaint_radius,cv2.INPAINT_TELEA if req.algorithm=="telea" else cv2.INPAINT_NS)
    except Exception:raise HTTPException(status_code=500,detail="OpenCV inpainting restoration failed.")
    score,label,warnings=calculate_inpaint_quality(img,restored,mask,req.bounds);out=io.BytesIO();Image.fromarray(cv2.cvtColor(restored,cv2.COLOR_BGR2RGB)).save(out,format="PNG");return InpaintResponse(status="success",algorithm_used=f"opencv_{req.algorithm}",restored_image_data=f"data:image/png;base64,{base64.b64encode(out.getvalue()).decode()}",quality_score=score,quality_label=label,warnings=warnings,processing_time_ms=round((time.time()-start)*1000,2))
@app.post("/api/projects")
async def save_project_metadata(req:ProjectCreateRequest,request:Request):
    principal=await principal_from_request(request);ensure_owner_not_forged(request,req.owner_session,principal);projects=db_manager.get_collection("projects");existing=await projects.find_one({"project_id":req.project_id});now=time.time();expires=now+RETENTION_WINDOW_SECONDS
    if existing and existing.get("owner_session")!=principal:raise HTTPException(status_code=403,detail="Project access denied")
    created=existing.get("created_at",now) if existing else now
    asset_ids=existing.get("asset_ids",[]) if existing else []
    if req.nodes:
        asset_ids=sorted(set(asset_ids+[n.get("assetId") for n in req.nodes if n.get("assetId")]))
    doc=ProjectMetadataModel(project_id=req.project_id,owner_session=principal,name=req.name,platform=req.platform,schema_version=req.schema_version,canvas_width=req.canvas_width,canvas_height=req.canvas_height,node_count=len(req.nodes) if req.nodes else req.node_count,nodes=req.nodes if req.nodes else (existing.get("nodes",[]) if existing else []),asset_ids=asset_ids,created_at=created,updated_at=now,expires_at=expires).model_dump()
    await projects.update_one({"project_id":req.project_id},{"$set":doc},upsert=True);return {"status":"success","project_id":req.project_id,"expires_at":expires,"node_count":doc["node_count"]}
@app.get("/api/projects/{project_id}")
async def get_project_metadata(project_id:str,request:Request):await require_project_owner(request,project_id);return await db_manager.get_collection("projects").find_one({"project_id":project_id})
@app.post("/api/projects/{project_id}/touch")
async def touch_project(project_id:str,request:Request):await require_project_owner(request,project_id);new_expiry=await retention_worker.extend_project_retention(project_id);return {"status":"success","project_id":project_id,"expires_at":new_expiry}
@app.delete("/api/projects/{project_id}")
async def delete_project(project_id:str,request:Request):
    await require_project_owner(request,project_id);assets=await db_manager.get_collection("assets").find({"project_id":project_id}).to_list(1000)
    for asset in assets:
        if asset.get("object_id"):storage_manager.delete_file(asset["object_id"])
    await db_manager.get_collection("assets").delete_many({"project_id":project_id});await db_manager.get_collection("projects").delete_one({"project_id":project_id});return {"status":"success","project_id":project_id}
@app.post("/api/files/upload")
async def upload_temporary_file(request:Request,file:UploadFile=File(...),project_id:str=Form(...),purpose:str=Form("uploads")):
    await require_project_owner(request,project_id)
    if purpose not in {"uploads","working","exports"}:raise HTTPException(status_code=400,detail="Invalid storage purpose")
    raw=await file.read()
    if len(raw)>MAX_FILE_SIZE_BYTES:raise HTTPException(status_code=413,detail="File exceeds the 50MB security limit.")
    valid,mime=validate_magic_bytes(raw)
    if not valid:raise HTTPException(status_code=400,detail="Invalid file signature or unsupported binary type.")
    fn=(file.filename or "").lower()
    if mime=="application/zip" or fn.endswith((".docx",".pptx",".zip")):
        safe,reason=check_zip_bomb(raw)
        if not safe:raise HTTPException(status_code=400,detail=f"File rejected: {reason}")
    ctype=mime if mime!="application/octet-stream" else (file.content_type or "application/octet-stream");meta:StoredObjectMetadata=storage_manager.upload_file(raw,project_id,purpose,ctype,RETENTION_WINDOW_SECONDS)
    await db_manager.get_collection("assets").insert_one(AssetMetadataModel(object_id=meta.object_id,project_id=project_id,purpose=meta.purpose,content_type=meta.content_type,size_bytes=meta.size,sha256=meta.sha256,created_at=meta.created_at,expires_at=meta.expires_at).model_dump());return {"status":"success","object_id":meta.object_id,"project_id":meta.project_id,"purpose":meta.purpose,"content_type":meta.content_type,"size_bytes":meta.size,"sha256":meta.sha256,"expires_at":meta.expires_at}
@app.get("/api/files/{object_id}")
async def download_temporary_file(object_id:str,request:Request):
    await require_asset_owner(request,object_id);result=storage_manager.download_file(object_id)
    if not result:raise HTTPException(status_code=404,detail="File not found or expired under 2-hour retention.")
    raw,meta=result;remaining=max(0,int(meta.expires_at-time.time()));return Response(content=raw,media_type=meta.content_type,headers={"Cache-Control":f"private, no-transform, max-age={remaining}","X-Expires-At":str(meta.expires_at),"X-SHA256":meta.sha256})
@app.delete("/api/files/{object_id}")
async def delete_temporary_file(object_id:str,request:Request):
    await require_asset_owner(request,object_id);deleted=storage_manager.delete_file(object_id);await db_manager.get_collection("assets").delete_one({"object_id":object_id});return {"status":"success","object_id":object_id,"deleted":deleted}
@app.post("/api/cleanup/purge-expired")
async def manual_retention_purge(request:Request):
    admin=os.environ.get("RECONSTRUCTA_ADMIN_SESSION","").strip();principal=await principal_from_request(request)
    if not admin or principal!=admin:raise HTTPException(status_code=403,detail="Administrative access required")
    return {"status":"success","purged":await retention_worker.purge_all_expired()}
if __name__=="__main__":
    import uvicorn;uvicorn.run(app,host="0.0.0.0",port=8000)
