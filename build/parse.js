// Turns Ollama's JSON reply into a clean object for the UI. KIND is set per node by the build script.
const raw = String($input.first().json?.message?.content ?? '');
let data = null;
try { data = JSON.parse(raw); } catch (e) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { data = JSON.parse(m[0]); } catch (e2) { data = null; } }
}
if (!data || typeof data !== 'object') {
  return [{ json: { ok: false, error: 'The model did not return valid JSON. Try again.', raw: raw.slice(0, 500) } }];
}
if (KIND === 'start') {
  // Safety net for money topics: force opening < steps < ceiling inside the range computed upstream.
  let money = null;
  try { money = $('Build hidden position request').first().json.money; } catch (e) { money = null; }
  if (money) {
    const r50 = (n) => Math.round(n / 50) * 50;
    const fmt = (n) => 'RM' + n.toLocaleString('en-US');
    const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/\d{3,}(\.\d+)?/); return m ? Number(m[0]) : null; };
    const setNum = (s, n) => (num(s) == null ? `${fmt(n)}. ${s || ''}`.trim() : String(s).replace(/RM\s*[\d,]{3,}(\.\d+)?|[\d,]{4,}(\.\d+)?/i, fmt(n)));
    let c = num(data.ceiling);
    if (c == null || c < money.lo || c > money.hi) { c = r50((money.lo + money.hi) / 2); data.ceiling = setNum(data.ceiling, c); }
    let o = num(data.opening_position);
    const oMax = r50(money.cur + (c - money.cur) * 0.3);
    const oMin = money.openMin ?? money.cur;
    if (o == null || o > oMax || o < oMin) { o = oMin; data.opening_position = setNum(data.opening_position, o); }
    const steps = Array.isArray(data.steps) ? data.steps.slice(0, 3) : [];
    while (steps.length < 2) steps.push('');
    let prev = o;
    data.steps = steps.map((s, i) => {
      let v = num(s);
      const want = r50(o + ((c - o) * (i + 1)) / (steps.length + 1));
      if (v == null || v <= prev || v >= c) { v = want; s = setNum(s, v); }
      prev = v;
      return s;
    });
    // Plain terms read naturally; the model's conditions ("if you send reports by Friday") made him sound like a contract.
    const plain = (s) => `${fmt(num(s))} basic salary`;
    data.opening_position = plain(data.opening_position);
    data.steps = data.steps.map(plain);
    data.ceiling = plain(data.ceiling);
  }
  return [{ json: { ok: true, brief: data } }];
}
try { data.outcome = $('Build scorecard request').first().json.outcome; } catch (e) { data.outcome = data.outcome || 'unfinished'; }
data.score = Math.max(1, Math.min(10, Math.round(Number(data.score) || 1)));
// Small models sometimes quote Hagrid as if ME said it: keep only quotes that match ME's real lines.
let mine = [];
try { mine = ($('End meeting').first().json.body.transcript || []).filter((t) => t.role === 'me').map((t) => String(t.text)); } catch (e) { mine = null; }
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const isMine = (q) => {
  if (!mine) return true;
  const qw = words(q);
  if (!qw.length) return false;
  return mine.some((line) => { const lw = new Set(words(line)); return qw.filter((w) => lw.has(w)).length / qw.length >= 0.7; });
};
const unlabel = (s) => String(s || '').replace(/^\s*(ME|HAGRID)\s*:\s*/i, '').replace(/[\u3000-\u9fff\uac00-\ud7af]/g, '');
for (const k of ['worked', 'lost_leverage', 'better_lines']) {
  const key = k === 'better_lines' ? 'you_said' : 'quote';
  for (const x of Array.isArray(data[k]) ? data[k] : []) for (const f of Object.keys(x || {})) x[f] = unlabel(x[f]);
  data[k] = (Array.isArray(data[k]) ? data[k] : []).filter((x) => x && isMine(x[key])).slice(0, 3);
}
return [{ json: { ok: true, score: data } }];
