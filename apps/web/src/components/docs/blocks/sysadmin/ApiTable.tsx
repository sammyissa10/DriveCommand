import React from 'react';

interface ApiTableRow {
  name: string;
  roleGuard: string;
  inputSchema: string;
  returnType: string;
}

interface ApiTableProps {
  rows: ApiTableRow[];
}

export function ApiTable({ rows }: ApiTableProps) {
  return (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="bg-muted text-left p-3 border-b border-border font-medium text-sm">
              Action
            </th>
            <th className="bg-muted text-left p-3 border-b border-border font-medium text-sm">
              Role Guard
            </th>
            <th className="bg-muted text-left p-3 border-b border-border font-medium text-sm">
              Input Schema
            </th>
            <th className="bg-muted text-left p-3 border-b border-border font-medium text-sm">
              Return Type
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="p-3 border-b border-border font-mono text-sm text-foreground">
                {row.name}
              </td>
              <td className="p-3 border-b border-border text-sm text-muted-foreground">
                {row.roleGuard}
              </td>
              <td className="p-3 border-b border-border text-sm text-muted-foreground">
                {row.inputSchema}
              </td>
              <td className="p-3 border-b border-border text-sm text-muted-foreground">
                {row.returnType}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
