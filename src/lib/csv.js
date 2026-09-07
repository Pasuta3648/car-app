// UTF-8 BOM lets Excel detect Chinese when opening the downloaded CSV directly.
export function serializeCSV(headers, data) {
  const escape = value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return '\uFEFF' + [headers, ...data.map(row => headers.map(h => row[h]))]
    .map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false;
  const finishRow = () => {
    row.push(value);
    if (row.some(cell => cell !== '')) rows.push(row);
    row = []; value = '';
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value === '') quoted = !quoted;
      else value += char;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else value += char;
  }
  if (quoted) throw new Error('CSV 中有未闭合的引号，请检查文件。');
  if (row.length || value) finishRow();
  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0].map(h => h.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSV 中存在重复列名。');
  const data = rows.slice(1).map((cells, index) => {
    if (cells.length > headers.length) throw new Error(`CSV 第 ${index + 2} 条记录的列数超出表头，请检查引号和逗号。`);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
  return { headers, data };
}

export function decodeCSV(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error('这是 Excel 工作簿，请先在 Excel 中另存为 CSV UTF-8（逗号分隔）再导入。');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
}
