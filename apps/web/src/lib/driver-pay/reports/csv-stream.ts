/**
 * csv-stream.ts — Streaming CSV response utility.
 * Emits header row first, then data rows incrementally.
 * Never buffers the full result in memory.
 */

function csvLine(values: string[]): string {
  return values
    .map((v) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    })
    .join(',');
}

export function streamCsvResponse(
  headers: string[],
  rows: AsyncIterable<string[]> | Iterable<string[]>,
  filename: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Emit header row first — always arrives before any data
      controller.enqueue(encoder.encode(csvLine(headers) + '\n'));

      // Determine if the iterable is async or sync
      if (Symbol.asyncIterator in (rows as AsyncIterable<string[]>)) {
        for await (const row of rows as AsyncIterable<string[]>) {
          controller.enqueue(encoder.encode(csvLine(row) + '\n'));
        }
      } else {
        for (const row of rows as Iterable<string[]>) {
          controller.enqueue(encoder.encode(csvLine(row) + '\n'));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store',
    },
  });
}
