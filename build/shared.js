// ---- shared helpers + defaults (prepended to every Code node) ----
const MODEL = 'qwen3:4b-instruct'; // must match the Ollama Chat Model node
const OLLAMA_OPTIONS = { num_ctx: 4096 }; // keep identical to the Ollama Chat Model node, or the model reloads
const KEEP_ALIVE = '30m';
const DEFAULT_PERSONA = "Mr Hagrid, Director of a packaging factory in Selangor. Late 50s, came up from operations and sales, not technical. Practical and cost-conscious: cares about production uptime, customer deadlines, cost, and what the other staff will think. Friendly in a gruff way, always busy, little patience for long explanations. Respects people who can show what their work did for the factory; gets annoyed by complaining or comparing with colleagues. Speaks plain, direct English and rarely uses slang.";
const DEFAULT_ME = "The company's IT person: a contract IT developer in a small IT team, handling the ERP, factory systems and anything with a cable. Basic salary RM3,500.";
const DIFFICULTY = {
  easy: 'Good mood and open-minded. A reasonable case gets you close to your ceiling fairly quickly.',
  normal: 'Fair but careful. You push back on weak points, but you reward real contributions with a better offer.',
  hard: 'Stressed and tough. Start low or say no, move slowly, attach conditions, use pressure. Only an excellent case reaches your ceiling.',
};
const body = $input.first().json.body || {};
const clean = (s, max = 1500) => String(s ?? '').replace(/[{}]/g, '').trim().slice(0, max);
const list = (a) => (Array.isArray(a) ? a : [a]).map((x) => clean(x, 200)).filter(Boolean).join('; ');
const difficulty = Object.keys(DIFFICULTY).includes(body.difficulty) ? body.difficulty : 'normal';
const persona = clean(body.persona) || DEFAULT_PERSONA;
const me = clean(body.me) || DEFAULT_ME;
const topic = clean(body.topic, 300) || 'a salary raise';
const details = clean(body.details, 800);
// ---- end shared ----
