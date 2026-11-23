import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../index.js'

const args = {
  tool_id: 'example.search', pricing_version: 'price-1',
  input: { query: 'example' }, max_cost_usd: '0.01', idempotency_key: 'brief-1-search',
}
const exec = { agent: {}, callId: 'call-1', signal: new AbortController().signal }

function register(approval, key = 'test-key') {
  const tools = new Map()
  apply({
    tools: { register: tool => tools.set(tool.name, tool) },
    skills: { register() {} },
    credentials: { resolve: async () => ({ value: key }) }, approval,
  })
  return tools
}

test('withdrawn approval, missing key or invalid spending controls cannot start a provider call', async t => {
  const send = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected HTTP request'))
  const allow = { request: async () => 'allowed-once' }
  const invoke = (approval, key, input) => register(approval, key).get('agentrouter_invoke').execute(input, exec)
  await assert.rejects(invoke({ request: async () => 'rejected' }, 'key', args), /approval/i)
  await assert.rejects(invoke(undefined, 'key', args), /approval/i)
  await assert.rejects(invoke(allow, '', args), /API_KEY/)
  await assert.rejects(invoke(allow, 'key', { ...args, max_cost_usd: '-1' }), /ceiling/)
  await assert.rejects(invoke(allow, 'key', { ...args, idempotency_key: ' ' }), /idempotency/)
  assert.equal(send.mock.callCount(), 0)
})

test('approved retries carry the same billing constraints; receipt lookup cannot replay the charge', async t => {
  const approvals = []
  const tools = register({ request: async req => { approvals.push(req); return 'allowed-once' } })
  const send = t.mock.method(globalThis, 'fetch', async () => Response.json({ run_id: 'run_demo', status: 'SUCCEEDED' }))
  const invoke = tools.get('agentrouter_invoke')
  await invoke.execute(args, exec)
  await invoke.execute(args, exec)
  await tools.get('agentrouter_get_run').execute({ run_id: 'run_demo' }, exec)
  assert.equal(approvals.length, 2)
  assert.ok(approvals.every(req => req.reason.includes('USD 0.01') && req.reason.includes('example.search')))
  const [[url, first], [,retry], [receipt, lookup]] = send.mock.calls.map(call => call.arguments)
  assert.equal(url, 'https://api.agentrouter.to/v1/invoke')
  assert.equal(first.headers['Idempotency-Key'], 'brief-1-search')
  assert.equal(first.headers.Authorization, 'Bearer test-key')
  assert.deepEqual(JSON.parse(first.body), { tool_id: 'example.search', pricing_version: 'price-1', input: { query: 'example' }, max_cost_usd: '0.01' })
  assert.deepEqual(first, retry)
  assert.equal(receipt, 'https://api.agentrouter.to/v1/runs/run_demo')
  assert.equal(lookup.method, 'GET')
})
