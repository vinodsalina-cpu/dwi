import { createServer } from 'node:http';

const host = '127.0.0.1';
const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'not_found', message: 'Unknown loopback route.' } }));
    return;
  }

  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'authentication', message: 'Missing synthetic authorization.' } }));
    return;
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 512 * 1024) {
      response.writeHead(413, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'request_too_large', message: 'Loopback request exceeded its test bound.' } }));
      return;
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'invalid_json', message: 'Loopback request was not JSON.' } }));
    return;
  }

  const model = typeof body.model === 'string' ? body.model : 'dwi-loopback-model';
  const userContent = Array.isArray(body.messages)
    ? body.messages.findLast((message) => message?.role === 'user')?.content
    : undefined;
  const isHealthCheck = body.max_tokens === 4 && userContent === 'Reply with exactly OK.';

  if (isHealthCheck) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      model,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
    }));
    process.send?.({ type: 'health' });
    return;
  }

  let semanticRequest;
  try {
    semanticRequest = JSON.parse(userContent);
  } catch {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'invalid_argument', message: 'Expected the semantic JSON contract.' } }));
    return;
  }

  const allowed = Array.isArray(semanticRequest.allowlistedSectionIds)
    ? semanticRequest.allowlistedSectionIds
    : [];
  const locked = new Set(Array.isArray(semanticRequest.lockedSectionIds) ? semanticRequest.lockedSectionIds : []);
  const sectionId = allowed.find((candidate) => typeof candidate === 'string' && !locked.has(candidate));
  if (semanticRequest.operation !== 'enhance' || typeof semanticRequest.baseHash !== 'string' || !sectionId) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'invalid_argument', message: 'Semantic request was outside the loopback contract.' } }));
    return;
  }

  const projectionContext = semanticRequest.estimationContext;
  const projection = {
    estimation_id: projectionContext.estimationId,
    estimation_status: 'estimate_only',
    baseline_projection: {
      total_tokens: 600,
      breakdown: { planning: 100, context_ingestion: 100, prompt_input: 100, tool_provider_calls: 100, retries: 100, final_output: 100 },
    },
    optimized_projection: {
      total_tokens: 480,
      breakdown: { planning: 80, context_ingestion: 80, prompt_input: 80, tool_provider_calls: 80, retries: 80, final_output: 80 },
    },
    projected_delta: { absolute_tokens: 120, percentage_change: 20 },
    cost: { status: 'cost_unavailable' },
    assumptions: ['Synthetic loopback contract estimate.'],
    metadata_used: ['moduleCount', 'criticality'],
    uncertainty_range: { baseline_min: 500, baseline_max: 700, optimized_min: 400, optimized_max: 600 },
    confidence: 'medium',
    routing_disclosure: { requested_provider: projectionContext.requestedProvider, requested_model: projectionContext.requestedModel },
    optimization_rationale: 'Exercise one bounded current semantic section replacement.',
  };
  const content = JSON.stringify({
    operation: 'enhance',
    baseHash: semanticRequest.baseHash,
    operations: [{ operation: 'replace-section', sectionId, text: 'Exercise the installed loopback semantic path with exact package-bound evidence.' }],
    projection,
  });
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    model,
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
  }), () => {
    process.send?.({ type: 'semantic' });
    server.close(() => process.exit(0));
  });
});

server.on('error', (error) => {
  process.send?.({ type: 'error', message: error.message });
  process.exitCode = 1;
});

server.listen(0, host, () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback server did not receive a TCP port.');
  process.send?.({ type: 'ready', baseUrl: `http://${host}:${address.port}/v1` });
});
