import { CircleCheck, CircleDashed, FileUp, Database, WandSparkles, Loader2 } from "lucide-react";

const PIPELINE_STEPS = [
  { title: "Connect Database", subtitle: "PostgreSQL connection" },
  { title: "Upload PDF", subtitle: "Select your document" },
  { title: "Define Schema", subtitle: "Map to DB table" },
  { title: "Extract & Preview", subtitle: "AI parsing" },
  { title: "Insert to DB", subtitle: "Confirm & commit" }
];

function StepIcon({ index, isDone, isActive, isConnected }) {
  if (isDone) return <CircleCheck size={14} />;
  if (isActive && index === 3) return <Loader2 size={14} className="spin" />;
  if (isActive) return <FileUp size={14} />;
  if (index === 0 && isConnected) return <CircleCheck size={14} />;
  return <CircleDashed size={14} />;
}

export function Sidebar({
  isConnected,
  dbLabel,
  onOpenDbModal,
  historyItems = [],
  activeHistoryId,
  onSelectHistoryItem,
  activeStep = 0,
  isExtracting = false,
  appView,
  onAppViewChange
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">=</div>
        <div><p className="brand-name">PDFflux</p></div>
      </div>

      <p className="sidebar-heading">PIPELINE</p>
      <ul className="pipeline-list">
        {PIPELINE_STEPS.map((step, index) => {
          const isDone = index === 0 ? isConnected : index < activeStep;
          const isActive = index === activeStep && index > 0;
          return (
            <li key={step.title} className={`pipeline-item ${isActive || (index === 0 && isConnected) ? "active" : ""}`}>
              <div className="pipeline-dot" style={{ color: isDone ? "#1de7bf" : isActive ? "#b7ef00" : undefined }}>
                <StepIcon index={index} isDone={isDone} isActive={isActive && isExtracting} isConnected={isConnected} />
              </div>
              <div>
                <p className="pipeline-title" style={{ color: isDone ? "#e8edf9" : isActive ? "#b7ef00" : undefined }}>{step.title}</p>
                <p className="pipeline-subtitle">
                  {index === 0 && isConnected ? `Connected: ${dbLabel}` :
                    isDone ? "Done ✓" : step.subtitle}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="sidebar-heading">NAVIGATION</p>
      <div style={{ padding: "0 12px", marginBottom: "16px" }}>
        <button
          className="run-btn full"
          style={{
            background: appView === "explorer" ? "#b7ef00" : "#1a2233",
            color: appView === "explorer" ? "#06080e" : "#f0f2f5",
            justifyContent: "flex-start"
          }}
          onClick={() => onAppViewChange("explorer")}
        >
          <Database size={15} style={{ marginRight: "10px" }} /> Data Explorer
        </button>
        <button
          className="run-btn full"
          style={{
            marginTop: "8px",
            background: appView === "extractor" ? "#b7ef00" : "#1a2233",
            color: appView === "extractor" ? "#06080e" : "#f0f2f5",
            justifyContent: "flex-start"
          }}
          onClick={() => onAppViewChange("extractor")}
        >
          <WandSparkles size={15} style={{ marginRight: "10px" }} /> Extraction Studio
        </button>
      </div>

      <p className="sidebar-heading">RECENT HISTORIES</p>
      <div className="recent-list" style={{ maxHeight: "220px", overflowY: "auto", overflowX: "hidden" }}>
        {historyItems.length === 0 && <span style={{ padding: "0 4px" }}>No rows inserted yet.</span>}
        {historyItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectHistoryItem(item)}
            style={{
              cursor: "pointer", padding: "8px", borderRadius: "8px",
              border: activeHistoryId === item.id ? "1px solid #355912" : "1px solid transparent",
              background: activeHistoryId === item.id ? "#14200c" : "transparent",
              transition: "0.2s ease"
            }}
          >
            <p style={{ margin: 0, fontWeight: "600", fontSize: "12px", color: activeHistoryId === item.id ? "#b7ef00" : "#a8b1c4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              📄 {item.fileName}
            </p>
            <span style={{ fontSize: "10px", color: "#667189", display: "block", marginTop: "2px" }}>
              {item.rows.length} rows • {new Date(item.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>

      <button className="db-chip" type="button" onClick={onOpenDbModal}>
        <Database size={16} />
        <div>
          <strong>{isConnected ? dbLabel : "No Database"}</strong>
          <span>{isConnected ? "PostgreSQL connected" : "Click to connect"}</span>
        </div>
      </button>

      <div className="profile-card">
        <WandSparkles size={14} />
        <div>
          <strong>PDFflux</strong>
          <span>AI Extraction Tool</span>
        </div>
      </div>
    </aside>
  );
}
