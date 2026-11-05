"""Tenant-filtered semantic ticket indexing and retrieval for Qdrant."""
import os
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
COLLECTION = os.getenv("QDRANT_COLLECTION", "ticket_embeddings")
_client = None
_model = None


def clients():
    global _client, _model
    if _client is None:
        _client = QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"),
                               api_key=os.getenv("QDRANT_API_KEY") or None)
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _client, _model


def ensure_collection():
    client, model = clients()
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(
                size=model.get_sentence_embedding_dimension(),
                distance=models.Distance.COSINE,
            ),
        )
    for field in ("tenant_id", "ticket_id", "category_id", "priority_id"):
        client.create_payload_index(
            collection_name=COLLECTION, field_name=field,
            field_schema=models.PayloadSchemaType.INTEGER,
        )


def index_ticket(*, tenant_id: int, ticket_id: int, subject: str, description: str,
                 category_id: int, priority_id: int, status: str):
    """Upsert one authoritative PostgreSQL ticket into the semantic index."""
    client, model = clients()
    ensure_collection()
    text = f"{subject}\n{description}".strip()
    vector = model.encode(text, normalize_embeddings=True).tolist()
    point_id = str(uuid5(NAMESPACE_URL, f"resolveiq:{tenant_id}:{ticket_id}"))
    client.upsert(
        collection_name=COLLECTION,
        points=[models.PointStruct(
            id=point_id, vector=vector,
            payload={"tenant_id": tenant_id, "ticket_id": ticket_id,
                     "category_id": category_id, "priority_id": priority_id,
                     "status": status, "text": text[:4000]},
        )],
    )


def search_similar(*, tenant_id: int, query: str, limit: int = 5):
    """Search only within one tenant. Caller must re-fetch IDs from PostgreSQL."""
    client, model = clients()
    ensure_collection()
    vector = model.encode(query, normalize_embeddings=True).tolist()
    result = client.query_points(
        collection_name=COLLECTION,
        query=vector,
        query_filter=models.Filter(must=[
            models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id))
        ]),
        limit=max(1, min(limit, 20)),
        with_payload=True,
    )
    return [{"ticket_id": point.payload["ticket_id"], "score": point.score,
             "payload": point.payload} for point in result.points]
