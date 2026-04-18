const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof data === "object" && data?.detail ? data.detail : data;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return data;
}

export async function connectDb(payload) {
  const response = await fetch(`${API_BASE}/api/db/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function uploadPdf(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/pdf/upload`, {
    method: "POST",
    body: formData
  });
  return parseResponse(response);
}

export async function fetchPdfPreview(fileId) {
  const response = await fetch(`${API_BASE}/api/pdf/${fileId}/preview`);
  return parseResponse(response);
}

export async function extractRows(payload) {
  const response = await fetch(`${API_BASE}/api/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function insertRows(payload) {
  const response = await fetch(`${API_BASE}/api/insert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function fetchForeignKeys(connectionId, table) {
  const response = await fetch(`${API_BASE}/api/db/${connectionId}/foreign-keys?table=${encodeURIComponent(table)}`);
  return parseResponse(response);
}

export async function fetchTableRows(connectionId, table, limit = 200) {
  const response = await fetch(`${API_BASE}/api/db/${connectionId}/table-rows?table=${encodeURIComponent(table)}&limit=${limit}`);
  return parseResponse(response);
}
