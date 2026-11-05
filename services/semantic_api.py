"""Internal semantic-search API. Keep this service private behind the Next.js server."""
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from services.vector_index import search_similar

app=FastAPI(title="ResolveIQ semantic search")
class SearchRequest(BaseModel):
    tenant_id:int=Field(gt=0)
    query:str=Field(min_length=3,max_length=2000)
    limit:int=Field(default=5,ge=1,le=20)

@app.post("/search")
def search(body:SearchRequest, x_internal_token:str|None=Header(default=None)):
    expected=os.getenv("SEMANTIC_INTERNAL_TOKEN")
    if not expected:
        raise HTTPException(status_code=503,detail="Internal service token is not configured")
    if x_internal_token!=expected:
        raise HTTPException(status_code=401,detail="Unauthorized")
    try:
        return {"results":search_similar(tenant_id=body.tenant_id,query=body.query,limit=body.limit)}
    except Exception as exc:
        raise HTTPException(status_code=503,detail="Semantic search unavailable") from exc
