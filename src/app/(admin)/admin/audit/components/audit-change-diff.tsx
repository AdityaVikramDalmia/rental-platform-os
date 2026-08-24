type AuditChangeDiffProps = {
  action: string;
  changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>;
  metadata?: unknown;
};

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">&mdash;</span>;
  }
  if (typeof value === "object") {
    return (
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return String(value);
}

export function AuditChangeDiff({ action, changes, metadata }: AuditChangeDiffProps) {
  const isInsert = action.endsWith("_INSERT");
  const isDelete = action.endsWith("_DELETE");

  const label = isInsert
    ? "Created with values:"
    : isDelete
      ? "Deleted record:"
      : "Changed fields:";

  const hasChanges = changes && changes.length > 0;

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>

      {hasChanges ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-1.5 text-left text-xs font-medium">Field</th>
                {!isInsert && <th className="px-3 py-1.5 text-left text-xs font-medium">Before</th>}
                {!isDelete && <th className="px-3 py-1.5 text-left text-xs font-medium">After</th>}
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.field} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 font-medium text-slate-700">
                    {snakeToTitle(change.field)}
                  </td>
                  {!isInsert && (
                    <td className="border-l-2 border-red-300 bg-red-50 px-3 py-1.5 text-red-800">
                      {renderValue(change.old_value)}
                    </td>
                  )}
                  {!isDelete && (
                    <td className="border-l-2 border-green-300 bg-green-50 px-3 py-1.5 text-green-800">
                      {renderValue(change.new_value)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400">No field-level changes recorded.</p>
      )}

      {metadata ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-700">
            Metadata
          </summary>
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-100 p-2 font-mono">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
