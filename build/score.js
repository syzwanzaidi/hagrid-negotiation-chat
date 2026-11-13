// Builds the coach request: reviews the transcript the UI sends and returns a structured scorecard.
const brief = body.brief && typeof body.brief === 'object' ? body.brief : {};
const outcome = ['deal', 'no deal', 'unfinished'].includes(body.outcome) ? body.outcome : 'unfinished';
const turns = Array.isArray(body.transcript) ? body.transcript : [];
let transcript = turns
  .map((t) => `${t.role === 'me' ? 'ME' : 'HAGRID'}: ${clean(t.text, 600)}`)
  .join('\n');
if (transcript.length > 9000) transcript = '...\n' + transcript.slice(-9000);
const myLines = turns.filter((t) => t.role === 'me').length;

const item = (props) => ({ type: 'object', properties: props, required: Object.keys(props) });
const schema = {
  type: 'object',
  properties: {
    final_terms: { type: 'string' },
    score: { type: 'integer', minimum: 1, maximum: 10 },
    headline: { type: 'string' },
    worked: { type: 'array', items: item({ quote: { type: 'string' }, why: { type: 'string' } }) },
    lost_leverage: { type: 'array', items: item({ quote: { type: 'string' }, why: { type: 'string' } }) },
    better_lines: { type: 'array', items: item({ you_said: { type: 'string' }, try_instead: { type: 'string' } }) },
    ceiling_gap: { type: 'string' },
  },
  required: ['final_terms', 'score', 'headline', 'worked', 'lost_leverage', 'better_lines', 'ceiling_gap'],
};

const system = `You are a sharp, honest negotiation coach. You review only how ME negotiated against Mr Hagrid, ME's director.

WHAT GOOD LOOKS LIKE
Strong: anchoring at or above the target, quantified value to the company (money saved, downtime avoided, hours), concrete impact even without exact figures (manual work eliminated, overtime cut, systems the factory depends on), market data, a calm pause after a lowball, asking about his constraints, trading instead of conceding, pinning down a date, getting agreements confirmed.
Weak: personal needs as the reason (bills, cost of living, expenses), giving a range, revealing a minimum, accepting the first offer, apologising, comparing with colleagues, threats too early, vague promises, conceding without getting something back.

FIELDS
- final_terms: what was agreed, or what was last on the table. Use RM for money.
- worked: ME's genuinely good moves. Quote ME's exact words. If ME made any concrete point (what they built, work removed, overtime cut, praise from a manager), include at least one item.
- lost_leverage: ONLY ME's weak moves or missed chances. Quote ME's exact words, never Hagrid's.
- better_lines: rewrite ME's weakest lines into stronger ones that ME would say to Hagrid, using the strong moves above. Never mention Hagrid's hidden position. Never suggest personal needs as an argument.
- English only.
- ceiling_gap: how far the result is from Hagrid's hidden ceiling, in one short sentence.
- headline: one blunt sentence verdict.
- At most 3 items per list. Quotes max 20 words (shorten long lines, keep ME's own words). Each "why" and "try_instead" max 25 words.

SCORE 1-10: 9-10 reached or nearly reached his ceiling with strong moves. 7-8 good result, small leaks. 5-6 okay but left value on the table. 3-4 weak, gave in early. 1-2 no preparation or caved. If the meeting is unfinished, score the moves made so far.
Reply with JSON only.`;

const user = `TOPIC: ${topic}
DIFFICULTY: ${difficulty}
OUTCOME: ${outcome}
ME: ${me}
HAGRID'S HIDDEN POSITION: opening: ${clean(brief.opening_position, 300)} | ceiling: ${clean(brief.ceiling, 300)} | pressures: ${list(brief.pressures)} | could trade: ${list(brief.trades)} | moved by: ${clean(brief.what_moves_him, 300)}
ME spoke ${myLines} times.

TRANSCRIPT:
${transcript || '(nothing was said)'}`;

return [{
  json: {
    outcome,
    ollamaBody: {
      model: MODEL,
      stream: false,
      keep_alive: KEEP_ALIVE,
      format: schema,
      options: { ...OLLAMA_OPTIONS, temperature: 0.2, num_predict: 900 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  },
}];
