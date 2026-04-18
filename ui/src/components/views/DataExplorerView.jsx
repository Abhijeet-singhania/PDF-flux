import { useState, useEffect } from "react";
import { fetchTableRows } from "../../api";
import { Loader2, Database } from "lucide-react";

export function DataExplorerView({ dbConnected, connectionId, tables, onOpenDbModal }) {
    const [selectedTable, setSelectedTable] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (selectedTable && connectionId) {
            setLoading(true);
            setError("");
            fetchTableRows(connectionId, selectedTable, 500)
                .then(data => setRows(data || []))
                .catch(err => setError(err.message || "Failed to fetch rows"))
                .finally(() => setLoading(false));
        } else {
            setRows([]);
        }
    }, [selectedTable, connectionId]);

    if (!dbConnected) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#8a93a6", flex: 1 }}>
                <Database size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
                <p style={{ marginBottom: "24px" }}>Connect a database to explore your data.</p>
                <button className="success-btn" onClick={onOpenDbModal}>Connect Database</button>
            </div>
        );
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return (
        <div style={{ display: "flex", height: "100%", flex: 1, backgroundColor: "#06080e" }}>
            {/* Table Sidebar List */}
            <div style={{ width: "240px", borderRight: "1px solid #1a2233", display: "flex", flexDirection: "column", backgroundColor: "#0b0f19" }}>
                <div style={{ padding: "16px", borderBottom: "1px solid #1a2233" }}>
                    <h3 style={{ margin: 0, fontSize: "12px", color: "#667189", letterSpacing: "1px", fontWeight: 600 }}>AVAILABLE TABLES</h3>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {tables.map(table => (
                        <button
                            key={table.name}
                            className="ghost-btn"
                            onClick={() => setSelectedTable(table.name)}
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                padding: "8px 12px",
                                backgroundColor: selectedTable === table.name ? "#14200c" : "transparent",
                                borderColor: selectedTable === table.name ? "#355912" : "transparent",
                                color: selectedTable === table.name ? "#b7ef00" : "#a8b1c4",
                                fontWeight: selectedTable === table.name ? 600 : 400
                            }}
                        >
                            <Database size={14} style={{ marginRight: "8px", opacity: selectedTable === table.name ? 1 : 0.6 }} /> {table.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Data View */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                {selectedTable ? (
                    <div style={{ padding: "16px", borderBottom: "1px solid #1a2233", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h2 style={{ margin: 0, fontSize: "18px", color: "#e8edf9" }}>{selectedTable}</h2>
                        <span className="tag ok">{rows.length} rows</span>
                    </div>
                ) : (
                    <div style={{ padding: "16px", borderBottom: "1px solid #1a2233" }}>
                        <h2 style={{ margin: 0, fontSize: "16px", color: "#667189", fontWeight: 400 }}>Select a table to view data</h2>
                    </div>
                )}

                <div style={{ flex: 1, padding: "16px", overflow: "hidden" }}>
                    {loading ? (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#667189" }}>
                            <Loader2 className="spin" size={24} />
                            <span style={{ marginLeft: "12px" }}>Loading data from database...</span>
                        </div>
                    ) : error ? (
                        <div className="status-inline error">{error}</div>
                    ) : selectedTable && rows.length > 0 ? (
                        <div className="panel table-panel" style={{ height: "100%", margin: 0 }}>
                            <div className="table-scroll" style={{ height: "100%" }}>
                                <table>
                                    <thead>
                                        <tr>
                                            {columns.map(col => <th key={col}>{col}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, idx) => (
                                            <tr key={idx}>
                                                {columns.map(col => (
                                                    <td key={col} style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "250px", overflow: "hidden" }}>
                                                        {String(row[col] ?? "")}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : selectedTable ? (
                        <div className="empty-state">No rows found in {selectedTable}.</div>
                    ) : (
                        <div className="empty-state" style={{ height: "100%" }}>
                            ← Choose a table from the sidebar to inspect its data structure
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
