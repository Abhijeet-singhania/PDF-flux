import { Plus, Trash2, Link, Check, X } from "lucide-react";
import { useState } from "react";

const TYPES = ["text", "int", "float", "date", "boolean"];

export function SchemaPanel({
  mode,
  onModeChange,
  tables,
  selectedTable,
  onTableChange,
  manualTableName,
  onManualTableNameChange,
  columns,
  onColumnsChange,
  onAiSuggest,
  fkMappings = {},
  fkSelections = {},
  onPickFk,
  onAddManualFkMapping
}) {
  const [linkingColIndex, setLinkingColIndex] = useState(null);

  function updateColumn(index, key, value) {
    onColumnsChange(columns.map((column, i) => (i === index ? { ...column, [key]: value } : column)));
  }

  function addColumn() {
    onColumnsChange([...columns, { name: `field_${columns.length + 1}`, type: "text" }]);
  }

  function removeColumn(index) {
    onColumnsChange(columns.filter((_, i) => i !== index));
  }

  return (
    <section className="panel schema-panel">
      <div className="panel-head">
        <h2>TARGET SCHEMA</h2>
        <span className="tag ok">{columns.length} cols</span>
      </div>

      <div className="tab-row">
        <button className={`tab ${mode === "existing" ? "active" : ""}`} type="button" onClick={() => onModeChange("existing")}>
          Existing Table
        </button>
        <button className={`tab ${mode === "new" ? "active" : ""}`} type="button" onClick={() => onModeChange("new")}>
          Define New
        </button>
      </div>

      {mode === "existing" ? (
        <>
          <label className="field-label">SELECT TABLE</label>
          <select className="field" value={selectedTable} onChange={(event) => onTableChange(event.target.value)}>
            <option value="">Select table</option>
            {tables.map((table) => (
              <option key={table.name} value={table.name}>
                {table.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label className="field-label">TABLE NAME</label>
          <input className="field" value={manualTableName} onChange={(event) => onManualTableNameChange(event.target.value)} />
        </>
      )}

      <label className="field-label">COLUMNS</label>
      <div className="column-list">
        {columns.map((column, index) => {
          const isFk = !!fkMappings[column.name];
          const hasSelectedFk = isFk && fkSelections[column.name] !== undefined;

          return (
            <div className="column-item" key={`${column.name}-${index}`} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={column.name}
                onChange={(event) => updateColumn(index, "name", event.target.value)}
                placeholder="column_name"
                disabled={isFk}
                style={{ opacity: isFk ? 0.7 : 1 }}
              />
              {!isFk && linkingColIndex !== index && (
                <>
                  <select value={column.type} onChange={(event) => updateColumn(index, "type", event.target.value)}>
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => setLinkingColIndex(index)} title="Link to Table">
                    <Link size={13} />
                  </button>
                </>
              )}
              {!isFk && linkingColIndex === index && (
                <div style={{ display: 'flex', flex: 1, gap: '4px', alignItems: 'center' }}>
                  <select
                    className="field"
                    style={{ padding: '0px 4px', height: '100%', fontSize: '12px' }}
                    onChange={(e) => {
                      if (e.target.value) {
                        onAddManualFkMapping(column.name, e.target.value);
                        setLinkingColIndex(null);
                      }
                    }}
                  >
                    <option value="">Ref Table...</option>
                    {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => setLinkingColIndex(null)}>
                    <X size={13} />
                  </button>
                </div>
              )}
              {isFk && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                  <span title={`Reference: ${fkMappings[column.name].referenced_table}`} style={{ display: 'flex', alignItems: 'center', color: '#ffb347' }}>
                    <Link size={14} style={{ marginRight: '4px' }} />
                  </span>
                  {!hasSelectedFk ? (
                    <button
                      type="button"
                      className="ghost-btn compact"
                      style={{ padding: '4px 8px', borderColor: '#ffb347', color: '#ffb347' }}
                      onClick={() => onPickFk(column.name)}
                    >
                      Pick
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn compact"
                      style={{ padding: '4px 8px', borderColor: '#3dd7b1', color: '#3dd7b1', flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}
                      onClick={() => onPickFk(column.name)}
                    >
                      <Check size={14} style={{ marginRight: '4px' }} /> {String(fkSelections[column.name])}
                    </button>
                  )}
                </div>
              )}
              {!hasSelectedFk && ( // Prevent removing bounded FK cols unless they want to remove entirely
                <button type="button" className="icon-btn column-remove" onClick={() => removeColumn(index)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button className="ghost-btn full" type="button" onClick={addColumn}>
        <Plus size={14} /> Add Column
      </button>
      <button className="run-btn full ai-btn" type="button" onClick={onAiSuggest}>
        AI Suggest Schema
      </button>
    </section>
  );
}
