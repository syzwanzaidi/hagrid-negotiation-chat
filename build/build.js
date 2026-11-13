// Assembles the n8n workflow JSON from the Code-node sources in this folder.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const shared = read('shared.js');
const parse = read('parse.js');
const out = process.argv[2];

const OLLAMA_CRED = { ollamaApi: { id: 'Tcfq99K0zp5JeGYT', name: 'Ollama account' } };
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';

const webhook = (name, p, mode, id, pos) => ({
  parameters: {
    httpMethod: 'POST',
    path: p,
    responseMode: mode,
    options: {},
  },
  name, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: pos, webhookId: id, id: `wh-${p}`,
});
const code = (name, js, pos) => ({
  parameters: { jsCode: js }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, id: `code-${name.replace(/\W+/g, '-').toLowerCase()}`,
});
const ollamaHttp = (name, pos) => ({
  parameters: {
    method: 'POST',
    url: OLLAMA_URL,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.ollamaBody) }}',
    options: { timeout: 300000 },
  },
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, id: `http-${name.replace(/\W+/g, '-').toLowerCase()}`,
});
const sticky = (content, pos, w, h, color) => ({
  parameters: { content, width: w, height: h, color },
  name: `Note ${pos.join('-')}`, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos, id: `note-${pos.join('-')}`,
});

const nodes = [
  sticky('## 1. Start meeting\nUI calls **POST /webhook/hagrid-start**. The model secretly decides Hagrid\'s opening, ceiling, pressures and trades (JSON). The UI keeps it hidden and sends it back every turn.', [-40, -440], 980, 300, 5),
  webhook('Start meeting', 'hagrid-start', 'lastNode', '5b0e6c1e-3a52-4c0e-9d1a-7f3e2b1c4a01', [0, -300]),
  code('Build hidden position request', shared + '\n' + read('start.js'), [240, -300]),
  ollamaHttp('Ollama: decide position', [480, -300]),
  code('Parse position', "const KIND = 'start';\n" + parse, [720, -300]),

  sticky('## 2. Chat with Mr Hagrid (streamed)\nUI calls **POST /webhook/hagrid-chat**. Replies stream word by word. Memory is per meeting (sessionId).\n**Model settings live in the Ollama node** (keep num_ctx = 4096 everywhere, or the model reloads = slow).', [-40, -100], 980, 520, 4),
  webhook('Chat message', 'hagrid-chat', 'streaming', '8a7d2b44-1f0e-4f7b-b3c2-6d9e0a5f1b02', [0, 60]),
  code('Build Hagrid prompt', shared + '\n' + read('chat.js'), [240, 60]),
  {
    parameters: {
      promptType: 'define',
      text: '={{ $json.message }}',
      options: { systemMessage: '={{ $json.systemPrompt }}', enableStreaming: true },
    },
    name: 'Mr Hagrid', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3.1, position: [500, 60], id: 'agent-hagrid',
  },
  {
    parameters: {
      model: 'qwen3:4b-instruct',
      options: { temperature: 0.8, numCtx: 4096, keepAlive: '30m', numPredict: 110, repeatPenalty: 1.1 },
    },
    name: 'Ollama Chat Model', type: '@n8n/n8n-nodes-langchain.lmChatOllama', typeVersion: 1, position: [420, 280], id: 'ollama-chat', credentials: OLLAMA_CRED,
  },
  {
    parameters: { sessionIdType: 'customKey', sessionKey: '={{ $json.sessionId }}', contextWindowLength: 30 },
    name: 'Meeting Memory', type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', typeVersion: 1.3, position: [620, 280], id: 'memory-hagrid',
  },

  sticky('## 3. Scorecard\nUI calls **POST /webhook/hagrid-score** with the full transcript. A strict coach prompt returns a structured scorecard (JSON).', [-40, 460], 980, 300, 6),
  webhook('End meeting', 'hagrid-score', 'lastNode', 'c3f1a9d0-6e2b-4a8c-8f5e-2a4b6c8d0e03', [0, 600]),
  code('Build scorecard request', shared + '\n' + read('score.js'), [240, 600]),
  ollamaHttp('Ollama: score', [480, 600]),
  code('Parse scorecard', "const KIND = 'score';\n" + parse, [720, 600]),
];

const main = (to) => ({ main: [[{ node: to, type: 'main', index: 0 }]] });
const connections = {
  'Start meeting': main('Build hidden position request'),
  'Build hidden position request': main('Ollama: decide position'),
  'Ollama: decide position': main('Parse position'),
  'Chat message': main('Build Hagrid prompt'),
  'Build Hagrid prompt': main('Mr Hagrid'),
  'Ollama Chat Model': { ai_languageModel: [[{ node: 'Mr Hagrid', type: 'ai_languageModel', index: 0 }]] },
  'Meeting Memory': { ai_memory: [[{ node: 'Mr Hagrid', type: 'ai_memory', index: 0 }]] },
  'End meeting': main('Build scorecard request'),
  'Build scorecard request': main('Ollama: score'),
  'Ollama: score': main('Parse scorecard'),
};

const wf = { name: 'Meeting with Mr Hagrid', nodes, connections, settings: { executionOrder: 'v1' }, pinData: {} };
fs.writeFileSync(out, JSON.stringify(wf, null, 2));
console.log('wrote', out, nodes.length, 'nodes');
