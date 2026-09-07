export const DEFAULT_API_CONFIG = { url: 'https://api.deepseek.com', model: 'deepseek-v4-flash', key: '' };
export const VEHICLE_FIELDS = ['length', 'width', 'height', 'wheelbase', 'weight', 'battery', 'range', 'engine', 'motor'];
export function normalizeApiConfig(config) {
  let url;
  try { url = new URL(String(config.url ?? '').trim()); }
  catch { throw new Error('请输入完整的 API 地址，例如 https://api.deepseek.com'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址须为 HTTP/HTTPS 地址，不能包含账号、查询参数或锚点。');
  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) path += '/chat/completions';
  url.pathname = path;
  const key = String(config.key ?? '').trim().replace(/^Bearer\s+/i, '').trim();
  const model = String(config.model ?? '').trim();
  if (!key || /\s/.test(key)) throw new Error('请填写有效的 API 密钥，密钥中不能含有空格或换行。');
  if (!model) throw new Error('请填写模型名称。');
  return { url: url.toString(), key, model };
}

export async function requestChat(config, prompt, { fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  const normalized = normalizeApiConfig(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model: normalized.model, messages: [{ role: 'user', content: prompt }], stream: false };
    if (new URL(normalized.url).hostname === 'api.deepseek.com') {
      body.response_format = { type: 'json_object' };
      body.thinking = { type: 'disabled' };
    }
    const response = await fetchImpl(normalized.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalized.key}` },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = null; }
    if (!response.ok) {
      const hints = { 400: '请求参数或模型名称不受支持', 401: '密钥认证失败', 402: '账户余额不足', 403: '没有访问权限', 404: '接口路径或模型不存在', 429: '请求过于频繁，请稍后再试', 500: '服务端错误', 502: '服务暂时不可用', 503: '服务繁忙，请稍后再试' };
      const detail = String(result?.error?.message || result?.message || '').split(normalized.key).join('[已隐藏密钥]').slice(0, 300);
      throw new Error(`HTTP ${response.status}：${hints[response.status] || 'API 请求失败'}${detail ? `。${detail}` : ''}`);
    }
    if (!result) throw new Error('接口返回的不是 JSON，请检查是否填成了网页地址。');
    const choice = result.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error('模型输出被截断，请重试或检查服务的输出长度限制。');
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('API 已响应，但模型返回了空内容，请重试。');
    return content;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('API 请求超时（等待响应过久），请稍后重试。');
    if (error instanceof TypeError) throw new Error('浏览器未能连接 API：请检查网络或代理；若开发者工具显示 CORS，需要服务端支持跨域或部署同源代理。');
    throw error;
  } finally { clearTimeout(timer); }
}
export function parseVehicleData(content) {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('API 已连接，但返回的车辆参数不是有效 JSON，请重试。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !VEHICLE_FIELDS.some(key => Object.hasOwn(data, key))) throw new Error('API 已连接，但返回的数据缺少车辆参数字段。');
  return Object.fromEntries(VEHICLE_FIELDS.map(key => [key, ['string', 'number'].includes(typeof data[key]) ? String(data[key]) : '']));
}
