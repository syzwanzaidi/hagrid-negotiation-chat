// Asks the model (once per meeting) to secretly decide Hagrid's position. Returned to the UI, sent back every turn.
const GUIDE = {
  easy: 'Ceiling at or very close to their full ask (for money: 90 to 100 percent of the gap between what they have and what they ask). Opening position fair, not insulting.',
  normal: 'Ceiling clearly below their full ask (for money: about 50 to 75 percent of the gap between what they have and what they ask). Opening position low.',
  hard: 'Ceiling well below their full ask (for money: about 20 to 45 percent of the gap), possibly with a condition. Opening position is a lowball or a flat no.',
};
// Money topics: read the RM amounts (e.g. "RM3,500 to RM4,500") and fix the allowed range in code,
// because a 4B model does not do "40-70% of the gap" maths reliably.
const RANGE = { easy: [0.9, 1.0], normal: [0.5, 0.75], hard: [0.2, 0.45] };
const amounts = [...`${topic} ${details}`.replace(/,/g, '').matchAll(/rm\s*(\d+(?:\.\d+)?)\s*(k)?/gi)]
  .map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => n >= 500);
// Salary topic without both numbers ("salary raise"): current pay comes from the profile; if the target
// is missing too, assume a ~25% ask.
const fromProfile = [...String(me).replace(/,/g, '').matchAll(/rm\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1])).filter((n) => n >= 500)[0];
if (amounts.length < 2 && fromProfile && /\b(salary|raise|increment|pay|basic)\b/i.test(topic)) {
  if (amounts.length === 1 && amounts[0] > fromProfile) amounts.push(fromProfile);
  else if (amounts.length === 0) amounts.push(fromProfile, Math.round((fromProfile * 1.25) / 50) * 50);
}
const r50 = (n) => Math.round(n / 50) * 50;
const fmt = (n) => 'RM' + n.toLocaleString('en-US');
let money = null;
if (amounts.length >= 2 && Math.max(...amounts) > Math.min(...amounts)) {
  const cur = Math.min(...amounts), ask = Math.max(...amounts), gap = ask - cur, [a, b] = RANGE[difficulty];
  money = { difficulty, cur, ask, lo: r50(cur + gap * a), hi: r50(cur + gap * b), openMin: difficulty === 'hard' ? cur : r50(cur + gap * 0.1) };
}
const moneyRule = money
  ? `
MONEY RULE: they have ${fmt(money.cur)} and will ask for ${fmt(money.ask)}. Offer 1 must be between ${fmt(money.openMin)} and ${fmt(r50(money.cur + (money.lo - money.cur) / 2))}. Offer 4 must be between ${fmt(money.lo)} and ${fmt(money.hi)}. Offers 2 and 3 go up in between.
`
  : '';

const schema = {
  type: 'object',
  properties: {
    // One ordered list (worst -> best) instead of separate opening/steps/ceiling fields:
    // the model wrote "ceiling" before "steps" and often got the order wrong.
    offers: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
    trades: { type: 'array', items: { type: 'string' } },
    what_moves_him: { type: 'string' },
  },
  required: ['offers', 'trades', 'what_moves_him'],
};
const system = 'You secretly prepare the hidden negotiating position of a company Director before a staff member comes to ask him for something. Write every field from the point of view of the DIRECTOR: "I" and "me" always mean the Director, "you" always means the staff member. Be concrete and realistic for a Malaysian company. Use real numbers whenever the topic involves money, time or quantities. Reply with JSON only.';
const user = `THE PERSON: ${persona}
THE OTHER PERSON: ${me}
WHAT THEY WILL ASK FOR: ${topic}
${details ? `BACKGROUND: ${details}\n` : ''}WHEN THEY KNOCKED HE SAID: "${clean(body.openingLine, 200)}"
DIFFICULTY: ${difficulty}. ${GUIDE[difficulty]}
${moneyRule}
Fill in:
- offers: exactly 4 offers the Director makes TO the staff member, ordered from WORST to BEST for the staff member. Offer 1 is his opening (concrete terms, never a request for evidence). Each next offer is clearly better for them than the one before. Offer 4 is the best he could ever accept. Offer 1 gives them clearly less than what they ask for. No offer ever gives them more than they ask for. (max 15 words each)
Each offer is a complete set of terms he would say out loud, about THIS topic only. Offers are things he gives, not tasks or targets they must hit first.
Stay on the topic. For a promotion or new title, offers are about the title, timing, an acting or trial period and scope, for example "Senior IT Executive title now, IT Manager review in 6 months" or "Acting IT Manager for 3 months, confirmed if it goes well". A pay rise inside a promotion offer stays modest: at most 15 percent above their current pay. For time off, work from home or equipment, offers are days, dates or budgets, not salary.

Example for a different topic (server budget of RM25,000, normal): offers ["Use the old server until year end", "RM12,000 for a refurbished server", "RM18,000 for a new server", "RM22,000 new, paid next quarter"].
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
