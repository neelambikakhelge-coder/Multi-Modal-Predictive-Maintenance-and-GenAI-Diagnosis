"""
Lightweight RAG module for the AURA GenAI diagnostic assistant.

Design choice: TF-IDF vectors stored in a FAISS index, instead of a heavy
neural embedding model. This is intentional for a time-constrained student
project:
  - No large model download (sentence-transformers is 300MB+ and needs a
    HuggingFace download on first run, which can fail on restricted networks)
  - Trains/builds instantly, fully deterministic, easy to explain in a viva
  - Still genuinely "RAG": query -> vector -> nearest-neighbor retrieval via
    FAISS -> retrieved context -> fed into the LLM prompt
  - FAISS is the same vector database named in the original proposal

If you want to upgrade to neural embeddings later (e.g. for the report,
mention it as a stated future improvement), swap `TfidfVectorizer` for
`sentence-transformers` and re-embed — the retrieval interface below
(`retrieve(query, k)`) stays the same either way.
"""

import os
import re
import numpy as np
import faiss
from sklearn.feature_extraction.text import TfidfVectorizer

MANUAL_PATH = os.path.join(os.path.dirname(__file__), "manuals", "maintenance_manual.txt")


def _chunk_manual(text: str) -> list[str]:
    """
    Split the manual into section-aware chunks.

    Each numbered subsection stays together with its heading, so a query such
    as "compressor blade erosion" retrieves both the diagnosis and its
    recommended action instead of separating them into unrelated chunks.
    """

    text = text.strip()

    # Split immediately before numbered sections/subsections such as:
    # Section 8:
    # 8.1 ...
    # 8.2 ...
    # 10.2 ...
    chunks = re.split(
        r"(?=^(?:Section\s+\d+:|\d+\.\d+\s+).*$)",
        text,
        flags=re.MULTILINE,
    )

    cleaned = []

    for chunk in chunks:
        chunk = chunk.strip()

        if len(chunk) > 40:
            cleaned.append(chunk)

    return cleaned


class ManualRetriever:
    def __init__(self, manual_path: str = MANUAL_PATH):
        with open(manual_path, "r", encoding="utf-8") as f:
            text = f.read()

        self.chunks = _chunk_manual(text)

        self.vectorizer = TfidfVectorizer(stop_words="english")
        tfidf_matrix = self.vectorizer.fit_transform(self.chunks).toarray().astype("float32")

        # Normalize so inner product == cosine similarity
        norms = np.linalg.norm(tfidf_matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1
        self.normed_matrix = tfidf_matrix / norms

        self.index = faiss.IndexFlatIP(self.normed_matrix.shape[1])
        self.index.add(self.normed_matrix)

    def retrieve(self, query: str, k: int = 3) -> list[str]:
        q_vec = self.vectorizer.transform([query]).toarray().astype("float32")
        norm = np.linalg.norm(q_vec)
        if norm > 0:
            q_vec = q_vec / norm

        scores, indices = self.index.search(q_vec, k)
        results = []
        for idx in indices[0]:
            if 0 <= idx < len(self.chunks):
                results.append(self.chunks[idx])
        return results


# Singleton instance, built once at import time
retriever = ManualRetriever()


if __name__ == "__main__":
    # quick manual test
    for q in ["vibration is high on the pump", "engine RUL is low, what should I do"]:
        print(f"\nQUERY: {q}")
        for chunk in retriever.retrieve(q, k=2):
            print(" -", chunk[:100].replace("\n", " "), "...")
