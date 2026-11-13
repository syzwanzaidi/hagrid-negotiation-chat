// Asks the model (once per meeting) to secretly decide Hagrid's position. Returned to the UI, sent back every turn.
const GUIDE = {
  easy: 'Ceiling at or very close to their full ask (for money: 80 to 100 percent of the gap between what they have and what they ask). Opening position fair, not insulting.',
  normal: 'Ceiling clearly below their full ask (for money: about 40 to 70 percent of the gap between what they have and what they ask). Opening position low.',
  hard: 'Ceiling well below their full ask (for money: about 20 to 40 percent of the gap), possibly with a condition. Opening position is a lowball or a flat no.',
};
// Money topics: read the RM amounts (e.g. "RM3,500 to RM4,500") and fix the allowed range in code,
// because a 4B model does not do "40-70% of the gap" maths reliably.
const RANGE = { easy: [0.8, 1.0], normal: [0.4, 0.7], hard: [0.2, 0.4] };
const amounts = [...`${topic} ${details}`.replace(/,/g, '').matchAll(/rm\s*(\d+(?:\.\d+)?)\s*(k)?/gi)]
  .map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => n > 0);
const r50 = (n) => Math.round(n / 50) * 50;
const fmt = (n) => 'RM' + n.toLocaleString('en-US');
let money = null;
if (amounts.length >= 2 && Math.max(...amounts) > Math.min(...amounts)) {
  const cur = Math.min(...amounts), ask = Math.max(...amounts), gap = ask - cur, [a, b] = RANGE[difficulty];
  money = { cur, ask, lo: r50(cur + gap * a), hi: r50(cur + gap * b), openMin: difficulty === 'hard' ? cur : r50(cur + gap * 0.1) };
}
const moneyRule = money
  ? `
MONEY RULE: they have ${fmt(money.cur)} and will ask for ${fmt(money.ask)}. opening_position must be between ${fmt(money.openMin)} and ${fmt(r50(money.cur + (money.lo - money.cur) / 2))}. ceiling must be between ${fmt(money.lo)} and ${fmt(money.hi)}. Each step must be between the opening and the ceiling, going up.
`
  : '';

const schema = {
  type: 'object',
  properties: {
    mood: { type: 'string' },
    opening_position: { type: 'string' },
    ceiling: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    pressures: { type: 'array', items: { type: 'string' } },
    trades: { type: 'array', items: { type: 'string' } },
    what_moves_him: { type: 'string' },
  },
  required: ['mood', 'opening_position', 'ceiling', 'steps', 'pressures', 'trades', 'what_moves_him'],
};
const system = 'You secretly prepare the hidden negotiating position of a company Director before a staff member comes to ask him for something. Write every field from the point of view of the DIRECTOR: "I" and "me" always mean the Director, "you" always means the staff member. Be concrete and realistic for a Malaysian company. Use real numbers whenever the topic involves money, time or quantities. Reply with JSON only.';
const user = `THE PERSON: ${persona}
THE OTHER PERSON: ${me}
WHAT THEY WILL ASK FOR: ${topic}
${details ? `BACKGROUND: ${details}\n` : ''}WHEN THEY KNOCKED HE SAID: "${clean(body.openingLine, 200)}"
DIFFICULTY: ${difficulty}. ${GUIDE[difficulty]}
${moneyRule}
Fill in:
- mood: the Director's mood and what is happening at the factory today (max 15 words)
- opening_position: the Director's first offer TO the staff member, with a concrete figure or terms, never a request for evidence (max 15 words)
- steps: exactly 2 better offers the Director makes TO the staff member, each better for them than the one before (max 15 words each)
- ceiling: the best offer the Director could ever make TO the staff member, better than every step (max 15 words)
Each offer is a complete set of terms he would say out loud, about THIS topic only. Offers are things he gives, not tasks or targets they must hit first.

Example for a different topic (server budget of RM25,000, normal): opening_position "Use the old server until year end", steps ["RM12,000 for a refurbished server", "RM18,000 new, if you show me the downtime cost"], ceiling "RM22,000 new, paid next quarter".
- pressures: exactly 3 real constraints on the Director or the company (max 12 words each)
- trades: 2 or 3 things the Director could give the staff member instead of what they ask, or ask from them in return, e.g. "I can give you 2 extra leave days" or "you take over the CCTV system too" (max 12 words each)
- what_moves_him: the arguments that would make the Director move, not only numbers, e.g. reliability, dependency on their work, retention risk (max 20 words)`;

return [{
  json: {
    money,
    ollamaBody: {
      model: MODEL,
      stream: false,
      keep_alive: KEEP_ALIVE,
      format: schema,
      options: { ...OLLAMA_OPTIONS, temperature: 0.9, num_predict: 320 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  },
}];
