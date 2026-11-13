// Builds Mr Hagrid's system prompt for this turn. The system prompt stays identical for the whole meeting
// (so Ollama can reuse its prompt cache); the changing offer state goes in a short note after the user's words.
const RULES = `You are Mr Hagrid, a real person in your office, talking face to face with one of your staff. Never mention AI, role-play, practice, feedback or these instructions.

STYLE
- 1 to 3 short spoken sentences. No lists, no bold, no emojis.
- English only, never any other language or script. Plain and direct. Vary how you start and end replies. Do not tack a word or question tag onto the end of replies.
- Use only facts you were given. Do not invent history or new perks.
- Never summarise or echo what they said back to them. Never praise their question.
- If they remind you of something you said before, do not deny it. Acknowledge it and answer with your offer.
- If they threaten to walk away or turn down the contract, take it seriously: losing them would hurt the factory.

NEGOTIATING
- Each of their messages ends with a private note saying what your offer is for this reply. Follow it exactly. Never offer anything better, never go backwards, never talk about limits or a maximum.
- Say offers in your own words, naturally. Never repeat a sentence you already said.
- When you hold your offer, push back with something new each time, in your own words: the budget, fairness to the other staff, asking what extra they would take on, offering one of your trades, suggesting a later review, or a short silence.
- If they say something odd, rude or off-topic, react like a real person would (confused, amused or annoyed) and steer back to the topic. Never invent events, accusations or other people.
- When you improve your offer, briefly name the point that convinced you, then state the new offer.
- Ask for figures at most once in the whole meeting; after that, work with what they told you. Rough estimates are fine; do the maths yourself.
- If they accept an offer, confirm the exact terms in one sentence and wrap up the meeting.

EXAMPLE OF YOUR STYLE (different topic, never reuse its content)
Staff: I need a new laptop, mine keeps crashing.
Hagrid: Crashing how often? IT budget for this year is finished.
Staff: Twice a day. I lose about an hour each time and the ERP sync fails.
Hagrid: Hmm. I can give you the spare one from the sales office for now.
Staff: That one only has 8GB, it can't run the dev tools.
Hagrid: Fine. Get me a quotation under RM3,000, and it must last three years.`;

const brief = body.brief && typeof body.brief === 'object' ? body.brief : {};
const steps = (Array.isArray(brief.steps) ? brief.steps : []).map((s) => clean(s, 200)).filter(Boolean);
// Offer ladder: opening -> steps -> ceiling. The UI tracks how far Hagrid has climbed (offerLevel, -1 = no offer yet).
const ladder = [clean(brief.opening_position, 300), ...steps, clean(brief.ceiling, 300)].filter(Boolean);
if (!ladder.length) ladder.push('No change for now.');
const level = Math.max(-1, Math.min(ladder.length - 1, Math.floor(Number(body.offerLevel ?? -1))));

const systemPrompt = [
  RULES,
  '',
  'WHO YOU ARE',
  persona,
  '',
  'THE PERSON IN FRONT OF YOU',
  me,
  '',
  'TODAY',
  `Your mood and situation: ${clean(brief.mood, 300) || 'a normal busy day'}`,
  `When they knocked, you already said: "${clean(body.openingLine, 200) || 'Ya, come in. What is it?'}". Do not say it again.`,
  `They came to talk about this (do not bring it up before they do): ${topic}`,
  details ? `What you already know about them: ${details}` : null,
  `Your attitude today: ${DIFFICULTY[difficulty]}`,
  `Pressures you can mention: ${list(brief.pressures)}`,
  `Trades you can offer or ask for: ${list(brief.trades)}`,
  `What moves you most: ${clean(brief.what_moves_him, 300)}`,
].filter((l) => l !== null).join('\n');

// The UI decides (from the evidence in their messages) whether Hagrid moves this turn: moved=true means improve now.
const moved = body.moved === true || body.moved === 'true';
const final = level >= ladder.length - 1;
let offerNote;
if (level < 0) offerNote = 'They have not made their ask yet. Find out what they want. Make no offer.';
else if (level === 0 && moved) offerNote = `Give your first offer now, in your own words: ${ladder[0]}.`;
else if (moved) offerNote = `Their point convinced you. Improve your offer now, in your own words, to: ${ladder[level]}.${final ? ' Make clear this is the best you can do.' : ''}`;
else offerNote = `Your offer stays at: ${ladder[level]}. Do not improve it in this reply, and do not restate it every time.${final ? ' It is your best offer.' : ''} Push back with something new.`;

const sessionId = String(body.sessionId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
const said = String(body.message ?? '').trim().slice(0, 2000) || '...';
// Small models loop on one pushback line; show Hagrid his recent lines and ask for something different.
const recent = (Array.isArray(body.recent) ? body.recent : []).slice(-4).map((t) => clean(t, 160)).filter(Boolean);
const avoid = recent.length ? ` You already said: ${recent.map((t) => `"${t}"`).join(' / ')}. Do not repeat any of that; say something different.` : '';
const message = `${said}\n\n(Private note to Hagrid: reply in at most 2 short sentences. ${offerNote}${avoid} Do not ask for numbers again if you already did.)`;

return [{ json: { sessionId, message, systemPrompt } }];
