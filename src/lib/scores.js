const SUMMARIES = ['静态', '城市', '高速', '动总', '底盘', 'NVH', '使用'];
const WEIGHTS = [10, 20, 25, 15, 20, 5, 5];
export function numberOrNull(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function normalizeScores({ headers, data }) {
  const legacy = headers.filter(h => h.endsWith('(1-5)'));
  const summaryKeys = new Set(legacy.map(h => `${h.split('-')[0]}-综合评分(自动)`));
  const rename = h => h.replace(/\(1-5\)$/, '(0-100)');
  const renamed = headers.map(rename);
  if (new Set(renamed).size !== renamed.length) throw new Error('同时存在五分制和百分制的同名评分列，请先保留一种。');
  return {
    headers: renamed,
    data: data.map(row => Object.fromEntries(headers.map(h => {
      const value = row[h];
      const n = numberOrNull(value);
      return [rename(h), (legacy.includes(h) || summaryKeys.has(h)) && n !== null ? n * 20 : value];
    }))),
  };
}
export function recalculateRow(row, headers) {
  const next = { ...row };
  for (const prefix of SUMMARIES) {
    const keys = headers.filter(h => h.startsWith(`${prefix}-`) && h.endsWith('(0-100)'));
    const values = keys.map(h => numberOrNull(next[h])).filter(v => v !== null);
    const summary = `${prefix}-综合评分(自动)`;
    if (keys.length && headers.includes(summary)) next[summary] = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : '';
  }
  if (headers.includes('综合得分(0-100)')) {
    const values = SUMMARIES.map(p => numberOrNull(next[`${p}-综合评分(自动)`]));
    const complete = values.every(v => v !== null);
    const total = complete ? Number(values.reduce((sum, v, i) => sum + v * WEIGHTS[i] / 100, 0).toFixed(4)) : '';
    next['综合得分(0-100)'] = total;
    if (headers.includes('推荐等级')) next['推荐等级'] = !complete ? '' : total >= 85 ? '强烈推荐' : total >= 70 ? '推荐' : total >= 55 ? '一般' : '不推荐';
  }
  return next;
}
