import { readFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import skills from './skills.json' with { type: 'json' }

export const name = 'agentrouter'
export const inject = {
  tools: { required: true },
  skills: { required: true },
  credentials: { required: false },
  approval: { required: false },
}

const api = 'https://api.agentrouter.to/v1'
const text = { type: 'string', required: true }
const output = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
}

async function request(path, signal, body, key, idempotencyKey) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (key) headers.Authorization = 'Bearer ' + key
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const response = await fetch(api + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers, redirect: 'error', signal, body: JSON.stringify(body),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('AgentRouter returned HTTP ' + response.status + ' without a JSON response.')
  }
  // Provider IDs can exceed JavaScript's safe integer range.
  const result = JSON.parse(await response.text(), (_key, value, context) =>
    Number.isInteger(value) && !Number.isSafeInteger(value) ? context.source : value)
  if (!response.ok && !result.run_id) {
    throw new Error('AgentRouter HTTP ' + response.status + ': ' + (result.error?.code ?? 'REQUEST_FAILED') + ' ' + (result.error?.message ?? ''))
  }
  return result
}

async function walletKey(ctx) {
  const credential = await ctx.credentials?.resolve('AGENTROUTER_API_KEY')
  if (!credential?.value) throw new Error('Set AGENTROUTER_API_KEY in the local DSH credentials or launch environment. Catalog previews work without a key.')
  return credential.value
}

export function apply(ctx) {
  for (const [name, description] of Object.entries(skills)) {
    const content = readFileSync(new URL(`./skills/${name}/SKILL.md`, import.meta.url), 'utf8')
    const skill = { name, description, content, source: 'runtime' }
    ctx.skills.register(skill)
    if (name === 'competitor-brief') {
      ctx.skills.register({
        ...skill, name: 'agentrouter-competitor-brief',
        invocation: { modelInvocable: false, userInvocable: true },
      })
    }
  }

  ctx.tools.register(defineTool({
    name: 'agentrouter_find',
    description: 'Find provider tools for a task. Free, no account required.',
    parameters: { query: text, limit: { type: 'integer' }, provider: { type: 'string' } },
    output,
    execute: ({ query, limit, provider }, { signal }) => request('/find', signal, { query, limit, provider }),
  }))

  ctx.tools.register(defineTool({
    name: 'agentrouter_describe',
    description: 'Read the current inputs, output contract, USD price and pricing version for a tool. Free.',
    parameters: { tool_id: text },
    output,
    execute: ({ tool_id }, { signal }) => request('/describe', signal, { tool_id }),
  }))

  ctx.tools.register(defineTool({
    name: 'agentrouter_invoke',
    description: 'Request approval for one provider call with an optional USD ceiling. Reuse the same idempotency key and arguments to retry.',
    parameters: {
      tool_id: text, pricing_version: text,
      input: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array' }], required: true },
      max_cost_usd: { type: 'string', description: 'Maximum USD charge for this call, as a decimal string.' },
      idempotency_key: { ...text, description: 'A unique stable ID for this logical call. Reuse it on retry.' },
      session_id: { type: 'string' },
    },
    output,
    async execute({ tool_id, pricing_version, input, max_cost_usd, idempotency_key, session_id }, exec) {
      if (max_cost_usd != null && (typeof max_cost_usd !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,12})?$/.test(max_cost_usd))) throw new Error('Provide a nonnegative decimal USD ceiling with up to 12 fractional digits.')
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotency_key)) throw new Error('Use a stable idempotency key of 1–200 letters, digits, dots, underscores, colons or hyphens.')
      const key = await walletKey(ctx)
      if (!exec.agent || !ctx.approval) throw new Error('This profile has no approval service for paid calls.')
      const decision = await ctx.approval.request({
        agent: exec.agent, callId: exec.callId, toolName: 'agentrouter_invoke', signal: exec.signal,
        reason: 'Send ' + JSON.stringify(input) + ' to ' + tool_id + ' through AgentRouter ' + (max_cost_usd == null ? 'at actual usage under your account budgets?' : 'for up to USD ' + max_cost_usd + '?'),
      })
      if (decision !== 'allowed-once') throw new Error('The call did not receive one-time approval.')
      return request('/invoke', exec.signal, { tool_id, pricing_version, input, max_cost_usd, session_id }, key, idempotency_key)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agentrouter_get_run',
    description: 'Read an existing run and receipt from the same wallet. Reading does not rerun the provider.',
    parameters: { run_id: text },
    output,
    async execute({ run_id }, { signal }) {
      if (!/^run_[A-Za-z0-9_-]+$/.test(run_id)) throw new Error('Use the run_id from an AgentRouter receipt.')
      return request('/runs/' + run_id, signal, undefined, await walletKey(ctx))
    },
  }))
}
