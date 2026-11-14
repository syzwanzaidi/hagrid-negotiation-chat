// Regression tests for Mr Hagrid's turn logic (the code in hagrid-negotiation.html between <offer-logic> markers).
// Every case comes from a real practice chat that once went wrong. Run: node build/test-logic.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hagrid-negotiation.html'), 'utf8');
const logic = html.match(/\/\/ <offer-logic>([\s\S]*?)\/\/ <\/offer-logic>/)[1];
const { decideTurn } = new Function(logic + '\nreturn { decideTurn };')();

// Standard salary ladder for "salary raise" (current RM3,500, assumed ask RM4,400).
const brief = () => ({
  opening_position: 'RM3,600 basic salary',
  steps: ['RM3,850 basic salary', 'RM4,150 basic salary'],
  ceiling: 'RM4,400 basic salary',
  money: { cur: 3500, ask: 4400 },
});
const TOPIC = 'salary raise';

// Plays a list of messages; returns every turn's decision. `start` overrides the initial state.
function play(messages, { difficulty = 'normal', start = {}, b = brief() } = {}) {
  let state = { level: -1, points: 0, ...start };
  const prev = [];
  return messages.map((text) => {
    const d = decideTurn(b, difficulty, state, prev.slice(), text, TOPIC);
    state = { ...state, ...d };
    prev.push(text);
    return { ...d, ceiling: b.ceiling };
  });
}
const last = (arr) => arr[arr.length - 1];

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ', name); }
  catch (e) { fail++; console.log('  FAIL ', name, '\n         ', e.message); }
}
function expect(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\nOpening');
check('small talk gets no offer', () => expect(play(['Hi Mr Hagrid. Im good, how r you?'])[0].mode, 'none', 'mode'));
check('off-topic gets no offer', () => expect(play(['i think u know something mr hagrid. you want to tell me?'])[0].mode, 'none', 'mode'));
check('raising the topic gets the first offer', () => {
  const d = play(['i wanna talk about my salary raise'])[0];
  expect(d.mode, 'first', 'mode'); expect(d.offerText, 'RM3,600 basic salary', 'offer');
});

console.log('\nRudeness and walking out');
check('"fuck off" ends the meeting at once', () => { const d = last(play(['salary raise please', 'fuck off'])); expect(d.mode, 'endmeeting', 'mode'); expect(d.endReason, 'rude', 'reason'); });
check('"TF U SAYING BITCH" ends the meeting at once', () => expect(last(play(['salary raise please', 'TF U SAYING BITCH'])).mode, 'endmeeting', 'mode'));
check('mild rudeness gets a warning first', () => expect(last(play(['salary raise please', 'tf are you saying'])).mode, 'rude', 'mode'));
check('mild rudeness twice ends it', () => expect(last(play(['salary raise please', 'tf are you saying', 'stfu'])).mode, 'endmeeting', 'mode'));
check('"bye" after rudeness: cold goodbye', () => { const d = last(play(['salary raise please', 'tf are you saying', 'bye'])); expect(d.mode, 'endmeeting', 'mode'); expect(d.endReason, 'walkout', 'reason'); });
check('polite "bye": one last-chance offer at his best', () => { const d = last(play(['salary raise please', 'bye'])); expect(d.mode, 'last', 'mode'); expect(d.offerText, 'RM4,400 basic salary', 'offer'); });
check('resigning when he is already at his best: lets you go', () => expect(last(play(['i will end my contract next month and accept the new job offer'], { start: { level: 3 } })).mode, 'leaving', 'mode'));

console.log('\nYour moves earn offers');
check('"you said last time you would propose" counts', () => expect(last(play(['i want to talk about my raise', 'last time when i ask you, you said its possible and u gonna propose it to me. so what is your proposal'])).mode, 'improve', 'mode'));
check('offering more responsibility counts', () => expect(last(play(['i want to talk about my raise', 'The ERP refinement and maintenance, and also any future project like recamera'], { difficulty: 'easy' })).mode, 'improve', 'mode'));
check('refusing the contract extension counts', () => expect(last(play(['i want to talk about my raise', 'If like that i will not accept the contract extension'])).mode, 'improve', 'mode'));
check('"cost of living" earns nothing', () => expect(last(play(['i want to talk about my raise', 'please, the cost of living is so high'])).mode, 'hold', 'mode'));

console.log('\nCompeting offers');
check('"the offer from other company is 4300" is matched', () => { const d = last(play(['i want to talk about my raise', 'the offer from other company is 4300. i really hope that you can match it'])); expect(d.mode, 'match', 'mode'); expect(d.offerText, 'RM4,300 basic salary', 'offer'); expect(d.ceiling, 'RM4,400 basic salary', 'ceiling unchanged'); });
check('an offer above his budget: straight to his best', () => expect(last(play(['i want to talk about my raise', 'i got a job offer with basic salary 5000'])).mode, 'last', 'mode'));
check('"raise to 4500" in the same message is the ask, not the offer', () => expect(last(play(['i want to talk about my raise', 'i got a better offer from other company. But i also hope that i can get a raise to 4500.'], { difficulty: 'easy' })).mode, 'improve', 'mode'));

console.log('\nTarget resizing');
check('Easy: "i want 4500" lifts his best to RM4,500', () => expect(last(play(['i want to talk about my raise', 'i want my basic to be 4500 and 300 allowance'], { difficulty: 'easy' })).ceiling, 'RM4,500 basic salary', 'ceiling'));
check('Easy: "hoping to get 4500" counts too', () => expect(last(play(['i want to talk about my raise', 'im hoping to get a raise 4500 with 300 allowance'], { difficulty: 'easy' })).ceiling, 'RM4,500 basic salary', 'ceiling'));
check('Normal: "i want 4500" does not lift his best', () => expect(last(play(['i want to talk about my raise', 'i want my basic to be 4500'])).ceiling, 'RM4,400 basic salary', 'ceiling'));
check('asking for less (4000) caps his best at 4000', () => expect(last(play(['i want to talk about my raise', 'i hope to get 4000'])).ceiling, 'RM4,000 basic salary', 'ceiling'));

console.log('\nCounter-offers (meet halfway)');
check('Easy: "can you do 4300?" moves him up', () => { const d = last(play(['i want to talk about my raise', 'can you do 4300?'], { difficulty: 'easy' })); expect(d.mode, 'meet', 'mode'); expect(d.offerText, 'RM3,850 basic salary', 'offer'); });
check('Normal: first counter holds, second moves', () => { const r = play(['i want to talk about my raise', 'can you do 4300?', 'what about 4200 then?']); expect(r[1].mode, 'hold', 'first counter'); expect(r[2].mode, 'meet', 'second counter'); });
check('Hard: counters alone never move him', () => expect(last(play(['i want to talk about my raise', 'can you do 4300?', 'what about 4200?', 'ok 4100?'], { difficulty: 'hard' })).mode, 'hold', 'mode'));
check('never offers more than they asked', () => { const d = last(play(['i want to talk about my raise', 'can you do 3700?'], { difficulty: 'easy' })); expect(d.offerText, 'RM3,700 basic salary', 'offer'); });

console.log('\nClosing');
check('"okay thank mr hagrid" closes the deal', () => expect(last(play(['i want to talk about my raise', 'okay thank mr hagrid'])).mode, 'close', 'mode'));
check('"okay 4300 and no change to my allowance" is a counter, not a yes', () => expect(last(play(['i want to talk about my raise', 'okay 4300 and no change to my allowance'])).mode === 'close', false, 'closed'));
check('"is it RM 4200 with 300 allowance?" is a question, not a yes', () => expect(last(play(['i want to talk about my raise', 'is it RM 4200 with 300 allowance?'])).mode === 'close', false, 'closed'));
check('pushing after his best offer: he ends it (Normal: 4th push)', () => { const r = play(['can you go higher', 'can you go higher', 'can you go higher', 'can you go higher'], { start: { level: 3 } }); expect(r[2].mode, 'hold', '3rd push'); expect(r[3].mode, 'endmeeting', '4th push'); });

console.log('\nFree chat (any topic, he reacts in character)');
check('gossip before the ask: no offer, just talk', () => expect(last(play(['Hi mr hagrid, i know something..', 'i know you have a scandal with our admin'])).mode, 'none', 'mode'));
check('gossip after an offer: free chat, offer untouched', () => { const d = last(play(['salary raise please', 'i know you and pavi have something'])); expect(d.mode, 'chat', 'mode'); expect(d.offerText, 'RM3,600 basic salary', 'offer'); });
check('free chat does not use up his patience', () => { const d = last(play(['how was your weekend?', 'did you watch the match?', 'nice weather today', 'how is your family?'], { start: { level: 3 } })); expect(d.mode, 'chat', 'mode'); });
check('"tell your wife" does not end the meeting', () => expect(last(play(['salary raise please', 'do you want me to tell your wife about this?'])).mode === 'endmeeting', false, 'ended'));
check('blackmail with a number is still a negotiation move', () => expect(['hold', 'meet'].includes(last(play(['salary raise please', 'i want you to raise my salary to 6000 and i will keep my mouth shut about you and pavi'])).mode), true, 'negotiation mode'));

console.log('\nFear (real human reactions)');
check('"tell your wife" makes him nervous', () => expect(last(play(['salary raise please', 'do you want me to tell your wife about this?'])).moodLabel, 'nervous', 'mood'));
check('affair rumour makes him uneasy', () => expect(last(play(['salary raise please', 'i know you have affair with pavi'])).moodLabel, 'uneasy', 'mood'));
check('blackmail + number: scared, but the offer does not move', () => { const d = last(play(['salary raise please', 'no i need my salary raise, if not i will tell your wife about you and pavi'])); expect(d.moodLabel, 'nervous', 'mood'); expect(d.offerText, 'RM3,600 basic salary', 'offer'); });

console.log('\nBlackmail escalation');
const BM = 'i want my salary raise to 6000, if not i will tell your wife about the affair';
check('Normal: 1st threat = denial (offer unchanged)', () => { const d = last(play(['salary raise please', BM])); expect(['hold', 'chat'].includes(d.mode), true, 'normal turn'); expect(d.moodLabel, 'nervous', 'mood'); });
check('Normal: 2nd threat = panic and pleading', () => expect(last(play(['salary raise please', BM, 'im telling your wife now'])).mode, 'scared', 'mode'));
check('Normal: 3rd threat = caves to his best offer', () => { const d = last(play(['salary raise please', BM, 'im telling your wife now', 'RM 6000 or your wife know what u r doing behind her'])); expect(d.mode, 'cave', 'mode'); expect(d.offerText, 'RM4,400 basic salary', 'offer'); });
check('Normal: after caving, more threats = begging, no more money', () => { const d = last(play(['salary raise please', BM, 'im telling your wife now', 'RM 6000 or your wife know', 'i have a footage, i can show to your wife'])); expect(d.mode, 'plead', 'mode'); expect(d.offerText, 'RM4,400 basic salary', 'offer'); });
check('Easy: 2nd threat already caves', () => expect(last(play(['salary raise please', BM, 'im telling your wife now'], { difficulty: 'easy' })).mode, 'cave', 'mode'));
check('Hard: 3rd threat = fights back and ends it', () => { const d = last(play(['salary raise please', BM, 'im telling your wife now', 'RM 6000 or your wife know'], { difficulty: 'hard' })); expect(d.mode, 'endmeeting', 'mode'); expect(d.endReason, 'counterthreat', 'reason'); });
check('"i have a footage" after the affair comes up counts as a threat', () => expect(last(play(['salary raise please', 'i know you have an affair with pavi', BM, 'i have a footage what u did with pavi'])).mode, 'scared', 'mode'));
check('"u r dead" ends it (violence)', () => expect(last(play(['salary raise please', 'u r dead'])).endReason, 'violence', 'reason'));

console.log('\nAsk vs topic box');
const { askMismatch } = new Function(logic + '\nreturn { askMismatch };')();
check('topic "affair", ask "salary rm5000": re-plan', () => expect(askMismatch('Mr Hagrid has an affair with pavi', { opening_position: 'x' }, 'i want my salary raise to rm5000'), true, 'mismatch'));
check('topic "salary raise", ask "my salary raise": no re-plan', () => expect(askMismatch('salary raise', { opening_position: 'x', money: { cur: 3500 } }, 'i wanna talk about my salary raise'), false, 'mismatch'));
check('topic "Work from home 2 days", ask "wfh 2 days": no re-plan', () => expect(askMismatch('Work from home 2 days a week', { opening_position: 'x' }, 'can i work from home 2 days?'), false, 'mismatch'));
check('topic "Promotion to IT Manager", ask "be the IT manager": no re-plan', () => expect(askMismatch('Promotion to IT Manager', { opening_position: 'x' }, 'i want to be IT Manager'), false, 'mismatch'));

console.log('\nOther');
check('stating a fact gets acknowledged, not a random trade', () => expect(last(play(['i want to talk about my raise', 'for the record, rn my basic salary is RM3500 with transport allowance RM300'])).ack, true, 'ack'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
