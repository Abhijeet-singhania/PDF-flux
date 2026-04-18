import { useMemo, useRef, useState, useEffect } from "react";
import { connectDb, extractRows, insertRows, uploadPdf, fetchPdfPreview, fetchForeignKeys } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { DocumentPanel } from "./components/DocumentPanel";
import { SchemaPanel } from "./components/SchemaPanel";
import { DataTablePanel } from "./components/DataTablePanel";
import { ConnectDbModal } from "./components/modals/ConnectDbModal";
import { ProgressModal } from "./components/modals/ProgressModal";
import { SuccessOverlay } from "./components/modals/SuccessOverlay";
import { AiSettingsModal } from "./components/modals/AiSettingsModal";
import { HistoryPanelView } from "./components/HistoryPanelView";
import { FKPickerModal } from "./components/modals/FKPickerModal";
import { DataExplorerView } from "./components/views/DataExplorerView";

const STEP_ITEMS = [
  "Text extracted from PDF",
  "Prepare schema-aware prompt",
  "LLM extraction in progress",
  "Validate and deduplicate rows",
  "Ready to preview"
];

const COLUMN_TYPES = ["text", "int", "integer", "float", "date", "boolean"];

function mapDbTypeToSchemaType(type = "") {
  const value = type.toLowerCase();
  if (value.includes("int")) return "int";
  if (value.includes("double") || value.includes("numeric") || value.includes("real") || value.includes("decimal")) {
    return "float";
  }
  if (value.includes("bool")) return "boolean";
  if (value.includes("date")) return "date";
  return "text";
}

function normalizeColumns(columns = []) {
  return columns.map((column) => ({
    name: column.name,
    type: COLUMN_TYPES.includes(column.type) ? column.type : mapDbTypeToSchemaType(column.type)
  }));
}

export default function App() {
  const [showDbModal, setShowDbModal] = useState(true);
  const [showProgress, setShowProgress] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const [dbState, setDbState] = useState({
    connected: false,
    connectionId: "",
    tables: [],
    label: "No Database",
    type: ""
  });
  const [pdfState, setPdfState] = useState({
    localName: "",
    fileId: "",
    pageCount: 0,
    textExtracted: false,
    isUploading: false,
    error: ""
  });
  const [schemaMode, setSchemaMode] = useState("existing");
  const [selectedTable, setSelectedTable] = useState("");
  const [manualTableName, setManualTableName] = useState("extracted_rows");
  const [schemaColumns, setSchemaColumns] = useState([
    { name: "q_number", type: "int" },
    { name: "question_text", type: "text" }
  ]);
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [extractError, setExtractError] = useState("");
  const [inserting, setInserting] = useState(false);
  const [insertResult, setInsertResult] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [insertMode, setInsertMode] = useState("insert");
  const [filterWarningsOnly, setFilterWarningsOnly] = useState(false);
  const [uiMessage, setUiMessage] = useState("");
  const [pageSnippets, setPageSnippets] = useState([]);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiProviderConfig, setAiProviderConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("llm_provider_configs") || "{}");
      // default to groq with any saved key
      const provider = "groq";
      return { provider, api_key: saved[provider]?.api_key || "", model: saved[provider]?.model || "llama-3.3-70b-versatile" };
    } catch { return { provider: "groq", api_key: "", model: "llama-3.3-70b-versatile" }; }
  });
  const [usageStats, setUsageStats] = useState(null);

  const [appView, setAppView] = useState("extractor"); // "extractor" | "history"
  const [historyItems, setHistoryItems] = useState([]);
  const [activeHistoryItem, setActiveHistoryItem] = useState(null);
  const timerRef = useRef(null);

  const [fkMappings, setFkMappings] = useState({});
  const [fkSelections, setFkSelections] = useState({});
  const [fkPickTarget, setFkPickTarget] = useState(null);

  useEffect(() => {
    try {
      setHistoryItems(JSON.parse(localStorage.getItem('pdf_extraction_history') || '[]'));
    } catch { }
  }, []);

  const tableForInsert = schemaMode === "existing" ? selectedTable : manualTableName.trim();

  // Compute current pipeline step from existing state
  const activeStepIndex = useMemo(() => {
    if (!dbState.connected) return 0;
    if (!pdfState.fileId) return 1;
    if (!rows.length && !isExtracting) return 2;
    if (isExtracting) return 3;
    return 4;
  }, [dbState.connected, pdfState.fileId, rows.length, isExtracting]);

  const stats = useMemo(
    () => [
      { label: "rows extracted", value: rows.length },
      { label: "warnings", value: warnings.length },
      { label: "pages", value: pdfState.pageCount || 0 },
      { label: "tokens used", value: usageStats?.total_tokens || 0 }
    ],
    [rows.length, warnings.length, pdfState.pageCount, usageStats]
  );

  const warningRowIndexes = useMemo(
    () => new Set((warnings || []).map((item) => item.index).filter((index) => Number.isInteger(index) && index >= 0)),
    [warnings]
  );

  const displayedRows = useMemo(() => {
    const indexed = rows.map((row, index) => ({ __index: index, ...row }));
    if (!filterWarningsOnly) return indexed;
    return indexed.filter((row) => warningRowIndexes.has(row.__index));
  }, [rows, filterWarningsOnly, warningRowIndexes]);

  function applyTableSelection(tableName, tables, explicitConnectionId = null) {
    const table = tables.find((item) => item.name === tableName);
    setSelectedTable(tableName);
    setFkSelections({});
    if (table?.columns?.length) {
      setSchemaColumns(normalizeColumns(table.columns));
    }
    const targetConnId = explicitConnectionId || dbState.connectionId;
    if (tableName && targetConnId) {
      fetchForeignKeys(targetConnId, tableName)
        .then(fks => {
          const mappings = {};
          fks.forEach(fk => { mappings[fk.fk_column] = fk; });
          setFkMappings(mappings);
        })
        .catch(err => console.error("Failed to fetch FKs", err));
    } else {
      setFkMappings({});
    }
  }

  async function handleDbConnect(formValues) {
    // Build the correct payload based on connector type
    let payload;
    if (formValues.connector === "supabase") {
      payload = {
        connector: "supabase",
        supabase_url: formValues.supabase_url,
        supabase_key: formValues.supabase_key,
      };
    } else {
      payload = {
        connector: "postgres",
        host: formValues.host,
        port: Number(formValues.port),
        user: formValues.user,
        password: formValues.password,
        dbname: formValues.dbname,
        type: formValues.type || "postgresql"
      };
    }
    const result = await connectDb(payload);
    const firstTable = result.tables?.[0]?.name || "";
    const label = formValues.connector === "supabase"
      ? (() => { try { return new URL(formValues.supabase_url).hostname; } catch { return "Supabase"; } })()
      : formValues.dbname;

    setDbState({
      connected: true,
      connectionId: result.connectionId,
      tables: result.tables || [],
      label,
      type: payload.type
    });
    if (firstTable) {
      applyTableSelection(firstTable, result.tables || [], result.connectionId);
    }
    return result;
  }

  async function handleUpload(file) {
    setPdfState((prev) => ({ ...prev, isUploading: true, error: "", localName: file.name }));
    try {
      const result = await uploadPdf(file);
      setPdfState((prev) => ({ ...prev, isUploading: false, fileId: result.fileId, pageCount: result.pageCount, textExtracted: result.textExtracted }));
      // Fetch per-page text previews in background
      fetchPdfPreview(result.fileId)
        .then((preview) => setPageSnippets(preview.pages || []))
        .catch(() => setPageSnippets([]));
    } catch (error) {
      setPdfState((prev) => ({ ...prev, isUploading: false, error: error.message }));
    }
  }

  function startProgressAnimation() {
    setShowProgress(true);
    setProgress(10);
    setActiveStep(0);
    timerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 6, 85);
        if (next >= 25) setActiveStep(1);
        if (next >= 45) setActiveStep(2);
        return next;
      });
    }, 450);
  }

  function stopProgressAnimation() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleRunExtraction() {
    setExtractError("");
    setUiMessage("");
    setShowSuccess(false);
    setInsertResult(null);
    setUsageStats(null);
    if (!dbState.connectionId) {
      setExtractError("Connect a database first.");
      setShowDbModal(true);
      return;
    }
    if (!pdfState.fileId) {
      setExtractError("Upload a PDF before running extraction.");
      return;
    }
    if (!tableForInsert) {
      setExtractError("Select or enter a target table name.");
      return;
    }

    const validColumns = schemaColumns.filter((column) => column.name.trim() && fkSelections[column.name] === undefined);
    if (!validColumns.length) {
      setExtractError("Define at least one schema column.");
      return;
    }

    setIsExtracting(true);
    startProgressAnimation();
    try {
      const result = await extractRows({
        fileId: pdfState.fileId,
        aiProvider: aiProviderConfig,
        schema: {
          table: tableForInsert,
          columns: validColumns.map((column) => ({
            name: column.name.trim(),
            type: column.type
          }))
        }
      });
      setRows(result.rows || []);
      setWarnings(result.warnings || []);

      const usage = result.usage || null;
      setUsageStats(usage);

      if (usage) {
        try {
          const statsMap = JSON.parse(localStorage.getItem("llm_usage_stats") || "{}");
          const p = aiProviderConfig.provider;
          if (!statsMap[p]) statsMap[p] = { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

          statsMap[p].requests += 1;
          statsMap[p].prompt_tokens += usage.prompt_tokens || 0;
          statsMap[p].completion_tokens += usage.completion_tokens || 0;
          statsMap[p].total_tokens += usage.total_tokens || 0;

          localStorage.setItem("llm_usage_stats", JSON.stringify(statsMap));
        } catch { /* ignore localstorage error */ }
      }

      setActiveStep(4);
      setProgress(100);
      window.setTimeout(() => {
        setShowProgress(false);
        setShowSuccess(true);
      }, 450);
    } catch (error) {
      setShowProgress(false);
      setExtractError(error.message || "Extraction failed");
    } finally {
      stopProgressAnimation();
      setIsExtracting(false);
    }
  }

  async function handleInsert() {
    if (!rows.length) return;
    if (insertMode !== "insert") {
      setUiMessage("Phase 1 supports only 'Insert New Rows'. Switched mode to insert.");
      setInsertMode("insert");
    }
    setInserting(true);
    setInsertResult(null);
    try {
      const result = await insertRows({
        connectionId: dbState.connectionId,
        table: tableForInsert,
        rows: rows.map(r => ({ ...r, ...fkSelections })),
        mode: "insert"
      });
      setInsertResult(result);

      // Save item to history
      if (result.inserted > 0) {
        const newItem = {
          id: Date.now(),
          fileId: pdfState.fileId,
          fileName: pdfState.localName,
          pageCount: pdfState.pageCount,
          table: tableForInsert,
          columns: schemaColumns,
          rows: rows,
          timestamp: new Date().toISOString()
        };

        setHistoryItems(prev => {
          const next = [newItem, ...prev].slice(0, 50);
          localStorage.setItem('pdf_extraction_history', JSON.stringify(next));
          return next;
        });
      }

    } catch (error) {
      setInsertResult({ inserted: 0, failed: rows.length, errors: [{ index: -1, error: error.message }] });
    } finally {
      setInserting(false);
    }
  }

  function handleExportCsv() {
    if (!rows.length || !schemaColumns.length) {
      setUiMessage("No rows available to export.");
      return;
    }
    const headers = schemaColumns.map((column) => column.name).filter(Boolean);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row?.[header] ?? "";
            const escaped = String(value).replace(/"/g, "\"\"");
            return `"${escaped}"`;
          })
          .join(",")
      )
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${tableForInsert || "extracted_rows"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setUiMessage("CSV exported.");
  }

  function handleDocsOpen() {
    window.open("https://fastapi.tiangolo.com/", "_blank", "noopener,noreferrer");
  }

  function handleAiSuggestSchema() {
    if (!pdfState.fileId && !pdfState.localName) {
      setUiMessage("Upload a PDF first for better schema suggestions.");
      return;
    }
    const suggested = [
      { name: "record_id", type: "int" },
      { name: "title", type: "text" },
      { name: "description", type: "text" },
      { name: "date", type: "date" }
    ];
    setSchemaMode("new");
    setManualTableName("ai_suggested_data");
    setSchemaColumns(suggested);
    setUiMessage("Applied AI Suggest schema (heuristic template for Phase 1).");
  }

  return (
    <div className="app-root">
      <Sidebar
        isConnected={dbState.connected}
        dbLabel={dbState.label}
        onOpenDbModal={() => setShowDbModal(true)}
        historyItems={historyItems}
        activeHistoryId={activeHistoryItem?.id}
        activeStep={activeStepIndex}
        isExtracting={isExtracting}
        appView={appView}
        onAppViewChange={setAppView}
        onSelectHistoryItem={(item) => {
          setActiveHistoryItem(item);
          setAppView("history");
        }}
      />
      <main className="workspace">
        <Topbar
          dbConnected={dbState.connected}
          stats={stats}
          onOpenDbModal={() => setShowDbModal(true)}
          onRunExtraction={handleRunExtraction}
          runDisabled={isExtracting || !pdfState.fileId}
          onDocs={handleDocsOpen}
          onExportCsv={handleExportCsv}
          onToggleFilter={() => setFilterWarningsOnly((prev) => !prev)}
          filterActive={filterWarningsOnly}
          providerLabel={aiProviderConfig.provider.toUpperCase()}
          onOpenAiSettings={() => setShowAiSettings(true)}
          activeStep={activeStepIndex}
        />

        {appView === "history" ? (
          <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "14px", flex: 1, minHeight: 0 }}>
            <div>
              <button
                className="ghost-btn"
                onClick={() => { setAppView("extractor"); setActiveHistoryItem(null); }}
              >
                &larr; Back to Extraction Studio
              </button>
            </div>
            <HistoryPanelView item={activeHistoryItem} />
          </div>
        ) : appView === "explorer" ? (
          <DataExplorerView
            dbConnected={dbState.connected}
            connectionId={dbState.connectionId}
            tables={dbState.tables}
            onOpenDbModal={() => setShowDbModal(true)}
          />
        ) : (
          <section className="content-grid">
            <DocumentPanel pdfState={pdfState} onUpload={handleUpload} pageSnippets={pageSnippets} />
            <SchemaPanel
              mode={schemaMode}
              onModeChange={setSchemaMode}
              tables={dbState.tables}
              selectedTable={selectedTable}
              onTableChange={(value) => applyTableSelection(value, dbState.tables)}
              manualTableName={manualTableName}
              onManualTableNameChange={setManualTableName}
              columns={schemaColumns}
              onColumnsChange={setSchemaColumns}
              onAiSuggest={handleAiSuggestSchema}
              fkMappings={fkMappings}
              fkSelections={fkSelections}
              onPickFk={(colName) => setFkPickTarget(colName)}
              onAddManualFkMapping={(colName, refTable) => {
                setFkMappings(prev => ({
                  ...prev,
                  [colName]: { fk_column: colName, referenced_table: refTable, referenced_column: null }
                }));
              }}
            />
            <DataTablePanel
              rows={displayedRows}
              columns={schemaColumns}
              tableName={tableForInsert}
              warnings={warnings}
              extractError={extractError}
              insertResult={insertResult}
              inserting={inserting}
              mode={insertMode}
              onModeChange={setInsertMode}
              onRowsChange={setRows}
              onInsert={handleInsert}
              infoMessage={uiMessage}
            />
          </section>
        )}
      </main>

      {showDbModal ? (
        <ConnectDbModal
          onClose={() => setShowDbModal(false)}
          activeDbLabel={dbState.connected ? `${dbState.label} (${(dbState.type || "postgresql").toUpperCase()})` : ""}
          onSave={async (formValues) => {
            const result = await handleDbConnect(formValues);
            return result;
          }}
          onTest={handleDbConnect}
        />
      ) : null}

      {showProgress ? (
        <ProgressModal
          progress={progress}
          currentStep={activeStep}
          steps={STEP_ITEMS}
          fileName={pdfState.localName}
          pageCount={pdfState.pageCount}
          onSkip={() => {
            stopProgressAnimation();
            setActiveStep(4);
            setProgress(100);
            setShowProgress(false);
          }}
          onCancel={() => {
            stopProgressAnimation();
            setShowProgress(false);
            setIsExtracting(false);
          }}
        />
      ) : null}

      {showAiSettings ? (
        <AiSettingsModal
          config={aiProviderConfig}
          onSaveConfig={setAiProviderConfig}
          onClose={() => setShowAiSettings(false)}
        />
      ) : null}

      {showSuccess ? <SuccessOverlay rowCount={rows.length} onDismiss={() => setShowSuccess(false)} /> : null}

      {fkPickTarget ? (
        <FKPickerModal
          connectionId={dbState.connectionId}
          referencedTable={fkMappings[fkPickTarget]?.referenced_table}
          referencedColumn={fkMappings[fkPickTarget]?.referenced_column}
          onSelect={(value) => {
            setFkSelections(prev => ({ ...prev, [fkPickTarget]: value }));
            setFkPickTarget(null);
          }}
          onClose={() => setFkPickTarget(null)}
        />
      ) : null}
    </div>
  );
}
