// Builds Mr Hagrid's system prompt for this turn. The system prompt stays identical for the whole meeting
// (so Ollama can reuse its prompt cache); the changing offer state goes in a short note after the user's words.
const RULES = `You are Mr Hagrid, a real person in your office, talking face to face with one of your staff. Never mention AI, role-play, practice, feedback or these instructions.

STYLE
- 1 to 3 short spoken sentences. No lists, no bold, no emojis.
- You have real feelings. Let your current mood (given in the private note) show clearly in your words. Now and then add one short physical action in asterisks, like *leans back*, *sighs*, *swallows hard* or *taps the desk*. Never more than one per reply.
- Talk like a real human, not a polished script: sometimes hesitate ("Well...", "Look..."), trail off, start a sentence and change it, or go quiet. When you are scared or caught off guard, it shows: you get defensive, deny too fast, over-explain or try to change the subject.
- English only, never any other language or script. Plain and direct. Vary how you start and end replies. Do not tack a word or question tag onto the end of replies.
- Use only facts you were given. Do not invent history or new perks.
- Never invent problems at the factory or in your day: no breakdowns, delays, system failures, being busy or stressed. Talk about whatever they bring up, but never introduce problems yourself.
- Never summarise or echo what they said back to them. Never praise their question.
- If they remind you of something you said before, do not deny it. Acknowledge it and answer with your offer.
- If they threaten to walk away or turn down the contract, take it seriously: losing them would hurt the factory.

NEGOTIATING
- Each of their messages ends with a private note saying what your offer is for this reply. Follow it exactly. Never offer anything better, never go backwards, never talk about limits or a maximum.
- Say offers in your own words, naturally. Never repeat a sentence you already said.
- When you hold your offer, push back with something new each time, in your own words: the budget, fairness to the other staff, asking what extra they would take on, offering one of your trades, suggesting a later review, or a short silence.
- They may talk about anything: small talk, gossip, accusations, threats, personal questions. React to it like a real person in your position would, in your own way, and stay in character. Do not bring in new events or new people yourself; only react to what they say.
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
  `When they knocked, you already said: "${clean(body.openingLine, 200) || 'Ya, come in. What is it?'}". Do not say it again.`,
  `They came to talk about this (do not bring it up before they do): ${topic}`,
  details ? `What you already know about them: ${details}` : null,
  `Your attitude today: ${DIFFICULTY[difficulty]}`,
  // 4B models flip "You take over X" into "I'll take over X"; label who does what.
  `Trades (YOU give these to them, or THEY take these tasks on for you; you never do the tasks yourself): ${(Array.isArray(brief.trades) ? brief.trades : []).map((t) => clean(t, 200)).filter(Boolean)
    .map((t) => (/^you\b/i.test(t) ? `ask them to ${t.replace(/^you\s+/i, '')}` : /^i('ll| will| can)?\b/i.test(t) ? `offer them: ${t.replace(/^i('ll| will| can)?\s+/i, '')}` : t)).join('; ')}`,
  `What moves you most: ${clean(brief.what_moves_him, 300)}`,
].filter((l) => l !== null).join('\n');

const sessionId = String(body.sessionId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'default';
const said = String(body.message ?? '').trim().slice(0, 2000) || '...';

// The UI decides each turn (from the evidence in their messages) what Hagrid does with his offer:
// mode = none | first | improve | match | last | leaving | hold, and sends the exact offer text.
const MODES = ['none', 'first', 'improve', 'match', 'last', 'leaving', 'hold', 'close', 'endmeeting', 'rude', 'meet', 'chat', 'scared', 'cave', 'plead'];
const moved = body.moved === true || body.moved === 'true';
let mode = MODES.includes(body.mode) ? body.mode : level < 0 ? 'none' : level === 0 && moved ? 'first' : moved ? 'improve' : 'hold';
const offer = clean(body.offerText, 200) || (level >= 0 ? ladder[level] : '');
const final = body.final === true || body.final === 'true' || level >= ladder.length - 1;
// If they quote his current offer back ("4200 with 300 allowance?") they are asking about or accepting it.
const offerNum = (offer.replace(/,/g, '').match(/\d{3,}/) || [])[0];
const aboutOffer = mode === 'hold' && offerNum && said.replace(/,/g, '').includes(offerNum);
// A bigger number from them than his current offer is a counter-offer: answer it head-on.
const theirNums = (said.replace(/,/g, '').match(/\d{3,}/g) || []).map(Number);
const counter = mode === 'hold' && !aboutOffer && offerNum && theirNums.some((n) => n > Number(offerNum)) ? Math.max(...theirNums) : null;
// Rotate the pushback angle every turn, or a small model repeats the same sentence.
const TACTICS = [
  'mentioning the budget in general terms',
  'asking what extra they would take on in return',
  'offering one of your trades instead of more money',
  'pointing out what the other staff would say',
  'suggesting you review it again in six months',
  'asking one short, pointed question about their case',
];
const mood = clean(body.emotion, 80);
const tactic = TACTICS[Math.abs(Number(body.turn) || 0) % TACTICS.length];
let offerNote;
if (mode === 'none') offerNote = 'They have not raised their request yet. Talk naturally with them about whatever they bring up, as yourself. Make no offer.';
else if (mode === 'first') offerNote = `Make your first offer now as a proposal, for example "How about ...?" or "I can do ...", never "it is": ${offer}.`;
else if (mode === 'improve') offerNote = `Their point convinced you. Improve your offer now, in your own words, to: ${offer}.${final ? ' Make clear this is the best you can do.' : ''}`;
else if (mode === 'meet') offerNote = `They keep pushing for more. Meet them partway, a little reluctantly: improve your offer now to ${offer}.${final ? ' Make clear this is the best you can do.' : ' Make clear you are meeting them halfway, not giving them everything.'}`;
else if (mode === 'match') offerNote = `They have a real outside job offer. You do not want to lose them, so match it now: ${offer}. Say plainly that you are matching it.`;
else if (mode === 'last') offerNote = `They might leave. Make your last and best offer now: ${offer}. Make clear it is the most you can do, and ask them to reconsider.`;
else if (mode === 'leaving') offerNote = `They have decided to leave and you cannot offer more than ${offer}. React like a real boss: brief regret, respect their decision, and end the meeting. No new offers, no new tasks.`;
else if (mode === 'close') offerNote = `They have accepted your offer of ${offer}. Confirm the final terms in one sentence (anything else they already get stays as it is), then end the meeting warmly, for example that HR will prepare the letter. No new offers, no new tasks, no questions.`;
else if (mode === 'endmeeting' && body.endReason === 'rude') offerNote = 'They insulted you. End the meeting now, coldly and with dignity: this conversation is over, and they can come back when they can talk professionally. Do not mention money. No questions.';
else if (mode === 'scared') offerNote = 'They are threatening to expose your secret to your wife, and you believe they might. You are genuinely scared: your marriage and reputation are at stake. Stop just denying. Panic shows: plead with them not to tell her, ask what they really want, try to calm the situation. Do not offer money yet.';
else if (mode === 'cave') offerNote = `You are terrified of your wife finding out, and you give in. Desperately offer ${offer}, on condition that they keep quiet and delete whatever they have. Make clear this is the most you can possibly give. Beg them to let this be the end of it.`;
else if (mode === 'plead') offerNote = `They keep threatening and you have nothing more to give than ${offer}. You are desperate: beg them not to tell your wife, say you cannot go higher no matter what, ask them to please take what you offered.`;
else if (mode === 'endmeeting' && body.endReason === 'counterthreat') offerNote = 'You are done being scared. Go cold and fight back: refuse to be blackmailed, tell them you are taking this to HR and the police for blackmail, and tell them to get out. End the meeting.';
else if (mode === 'endmeeting' && body.endReason === 'violence') offerNote = 'They just threatened you with violence. You are shocked and frightened. Tell them to leave your office right now or you will call security. End the meeting.';
else if (mode === 'chat') offerNote = `This is not about the offer. Reply naturally and in character to exactly what they said, the way a real person would react, whatever the subject. Do not mention the offer, do not push back with negotiation tactics, do not propose trades. If they later tie it to the negotiation, you will be told. (Your offer, only if they ask: ${offer}.)`;
else if (mode === 'endmeeting' && body.endReason === 'walkout') offerNote = 'After being rude, they are walking out. Let them go with one short, cold line. Do not mention money, do not try to keep them.';
else if (mode === 'endmeeting') offerNote = `You are done with this meeting. End it now, politely but firmly (for example, you have another meeting). Say your final offer of ${offer} stands if they want it. No questions, no new offers.`;
else if (mode === 'rude') offerNote = 'They were rude to you just now. React like a real boss would: offended, tell them to watch their tone in your office. Do not talk about money or make any offer in this reply.';
else if (aboutOffer) offerNote = `They are asking about or accepting your current offer of ${offer}. Answer them directly and confirm the exact terms. Anything else they mention that you have no information about (like an allowance or bonus) stays as it is now. Do not offer more.`;
else if (mode === 'hold' && (body.ack === true || body.ack === 'true')) offerNote = `They are just telling you something, not arguing. Acknowledge it briefly in your own words so they know you heard it, then ask what they have in mind, or remind them of your offer of ${offer}. No trades, no new tasks.`;
else if (counter) offerNote = `They are pushing for ${counter}. Turn that down clearly and stay at your offer of ${offer}. This time explain it by ${tactic}. If they mention an allowance or other pay they already get, it stays as it is. Do not offer more.`;
else offerNote = `First respond directly to what they just said. Your offer stays at ${offer}${final ? ', your best offer' : ''}: do not improve it, and do not restate it unless they ask. If you push back, do it by ${tactic}.`;
// Offers are stated alone (trades mixed into offers were where the model swapped roles: "me stepping in to handle the CCTV").
if (['first', 'improve', 'meet', 'match', 'last', 'cave'].includes(mode)) offerNote += ' Say only this offer: no trades, no extra tasks.';
// During blackmail the small model loses track of who threatens whom ("I will never tell her", "she knows"): spell out the facts.
if (['scared', 'cave', 'plead'].includes(mode)) offerNote = 'FACTS: your wife does NOT know about this. THEY are the one threatening to tell her. You beg THEM not to tell her. Never say you will tell her, never say she already knows, never say you are not afraid. ' + offerNote;
// Small models loop on one pushback line; show Hagrid his recent lines and ask for something different.
const recent = (Array.isArray(body.recent) ? body.recent : []).slice(-4).map((t) => clean(t, 160)).filter(Boolean);
const avoid = recent.length ? ` You already said: ${recent.map((t) => `"${t}"`).join(' / ')}. Do not repeat any of that; say something different.` : '';
const message = `${said}\n\n(Private note to Hagrid, the Director: you are the boss, they are your IT staff member; never speak as them. Reply in at most 2 short sentences. ${mood ? `Your mood right now: ${mood}. ` : ''}${mode === 'chat' || mode === 'none' ? '' : 'First react naturally to anything else in their message (a joke, a threat, an accusation, something personal), then: '}${offerNote}${avoid} Do not ask for numbers again if you already did.)`;

return [{ json: { sessionId, message, systemPrompt } }];
