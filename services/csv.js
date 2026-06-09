function quoteField(val) {
  const s = (val ?? '').replace(/\r?\n/g, ' ');
  return `"${s.replace(/"/g, '""')}"`;
}

export function serializeCSV(cards) {
  const lines = ['front,back,exampleSentence'];
  for (const c of cards) {
    lines.push([c.front, c.back, c.exampleSentence].map(quoteField).join(','));
  }
  return lines.join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }

  return rows;
}
