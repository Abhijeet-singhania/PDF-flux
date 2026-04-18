import { useState, useEffect, useMemo } from "react";
import { Search, Loader2, X } from "lucide-react";
import { fetchTableRows } from "../../api";

export function FKPickerModal({ connectionId, referencedTable, referencedColumn, onSelect, onClose }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        async function loadData() {
            try {
                const data = await fetchTableRows(connectionId, referencedTable, 200);
                setRows(data || []);
            } catch (err) {
                setError(err.message || "Failed to load rows");
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [connectionId, referencedTable]);

    const filteredRows = useMemo(() => {
        if (!searchTerm) return rows;
        const lower = searchTerm.toLowerCase();
        return rows.filter((row) =>
            Object.values(row).some((val) => String(val).toLowerCase().includes(lower))
        );
    }, [rows, searchTerm]);

    function getDisplayLabel(row, pkCol) {
        // Find the first string-ish column that isn't the primary key to use as a label
        for (const key of Object.keys(row)) {
            if (key !== pkCol && typeof row[key] === "string" && isNaN(Number(row[key]))) {
                return row[key];
            }
        }
        // Fallback: just return the ID if no obvious label found
        return JSON.stringify(row);
    }

    return (
        <div className="overlay">
            <div className="modal" style={{ width: "min(92vw, 600px)" }}>
                <div className="modal-head">
                    <div>
                        <h3>Pick {referencedColumn} from {referencedTable}</h3>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="search-bar" style={{ display: "flex", alignItems: "center", gap: "8px", background: "#06080e", border: "1px solid #2a3347", padding: "6px 12px", borderRadius: "6px", marginBottom: "14px" }}>
                    <Search size={14} color="#7a85a0" />
                    <input
                        autoFocus
                        placeholder="Search rows..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ background: "transparent", border: "none", color: "#f0f2f5", outline: "none", width: "100%", fontSize: "13px" }}
                    />
                </div>

                <div style={{ maxHeight: "350px", overflowY: "auto", display: "grid", gap: "6px" }}>
                    {loading && <div style={{ padding: "20px", textAlign: "center", color: "#7a85a0" }}><Loader2 className="spin" size={20} /></div>}
                    {error && <div className="status-inline error">{error}</div>}
                    {!loading && !error && filteredRows.length === 0 && (
                        <div style={{ padding: "20px", textAlign: "center", color: "#7a85a0", fontSize: "13px" }}>No rows found.</div>
                    )}

                    {!loading && filteredRows.map((row) => {
                        const pkCol = referencedColumn || Object.keys(row)[0] || "id";
                        const pkValue = row[pkCol];
                        const displayLabel = getDisplayLabel(row, pkCol);
                        return (
                            <button
                                key={pkValue}
                                className="ghost-btn"
                                style={{ justifyContent: "flex-start", textAlign: "left", padding: "10px 14px", border: "1px solid #1a2233" }}
                                onClick={() => onSelect(pkValue)}
                            >
                                <div>
                                    <strong style={{ color: "#3dd7b1" }}>{pkValue}</strong>
                                    <span style={{ marginLeft: "12px", color: "#8a93a6", fontSize: "12px" }}>
                                        {displayLabel !== JSON.stringify(row) ? displayLabel : Object.entries(row).filter(([k]) => k !== pkCol).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(", ")}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
