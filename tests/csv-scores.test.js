import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, serializeCSV, decodeCSV } from '../src/lib/csv.js';
import { normalizeScores, recalculateRow, numberOrNull } from '../src/lib/scores.js';

test('CSV retains quoted Chinese text, commas, newlines and whitespace', () => {
  const headers = ['车型', '评价'];
  const data = [{ '车型': '极氪 007GT', '评价': '  他说"舒服",后排\n空间足  ' }];
  assert.deepEqual(parseCSV(serializeCSV(headers, data)), { headers, data });
});
test('CSV output has UTF-8 BOM and Excel line endings', () => {
  const result = serializeCSV(['车型'], [{ 车型: '萤火虫' }]);
  assert.deepEqual([...new TextEncoder().encode(result).slice(0, 3)], [239, 187, 191]);
  assert.equal(result, '\uFEFF车型\r\n萤火虫\r\n');
});
test('header-only and BOM templates remain usable', () => {
  assert.deepEqual(parseCSV('\uFEFF车型,评价\r\n'), { headers: ['车型', '评价'], data: [] });
});
test('UTF-8 and GBK Chinese decode without replacement characters', () => {
  assert.equal(decodeCSV(new TextEncoder().encode('中文')), '中文');
  assert.equal(decodeCSV(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])), '中文');
});
test('malformed rows are rejected instead of silently losing data', () => {
  assert.throws(() => parseCSV('车型,评价\nA,B,C'), /列数/);
  assert.throws(() => parseCSV('车型,评价\nA,"B'), /引号/);
  assert.throws(() => decodeCSV(new Uint8Array([0x50, 0x4b, 3, 4])), /Excel/);
});
test('legacy scores are proportional, other values and final total stay unchanged', () => {
  const headers = ['车型', '静态-视野(1-5)', '静态-综合评分(自动)', '综合得分(0-100)', '年款'];
  const result = normalizeScores({ headers, data: [{ 车型: '测试车', '静态-视野(1-5)': '3', '静态-综合评分(自动)': '4.5', '综合得分(0-100)': '87', 年款: '2025' }] });
  assert.equal(result.data[0]['静态-视野(0-100)'], 60);
  assert.equal(result.data[0]['静态-综合评分(自动)'], 90);
  assert.equal(result.data[0]['综合得分(0-100)'], '87');
  assert.equal(result.data[0]['年款'], '2025');
  assert.deepEqual(normalizeScores(result), result);
});
test('zero scores stay zero; blank scores stay absent', () => {
  assert.equal(numberOrNull(0), 0);
  assert.equal(numberOrNull(''), null);
  const row = recalculateRow({ '静态-视野(0-100)': 0, '静态-舒适(0-100)': 60 }, ['静态-视野(0-100)', '静态-舒适(0-100)', '静态-综合评分(自动)']);
  assert.equal(row['静态-综合评分(自动)'], 30);
});
test('edited records, unknown columns and new records all survive export', () => {
  const db = parseCSV('车型,评价,自定义\r\n旧车,旧评语,保留\r\n');
  db.data[0]['评价'] = '新的"评语",中文\n换行';
  db.data.push({ 车型: '新车', 评价: '新记录' });
  const result = parseCSV(serializeCSV(db.headers, db.data));
  assert.equal(result.data[0]['评价'], db.data[0]['评价']);
  assert.equal(result.data[0]['自定义'], '保留');
  assert.equal(result.data[1]['车型'], '新车');
});
test('weighted total uses all seven existing weights and retains non-score data', () => {
  const row = { 车型: '测试车' };
  const headers = ['车型', '综合得分(0-100)', '推荐等级'];
  for (const prefix of ['静态', '城市', '高速', '动总', '底盘', 'NVH', '使用']) {
    headers.push(`${prefix}-测试(0-100)`, `${prefix}-综合评分(自动)`);
    row[`${prefix}-测试(0-100)`] = 80;
  }
  const result = recalculateRow(row, headers);
  assert.equal(result['综合得分(0-100)'], 80);
  assert.equal(result['推荐等级'], '推荐');
  assert.equal(result['车型'], '测试车');
});
