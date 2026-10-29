import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { testStatelessMcpApp } from '@repo/mcp-common/src/test/stateless-app'

import worker, { mcpHandler } from './agent-notes.app'

import type { Env } from './agent-notes.context'

testStatelessMcpApp<Env>({
	name: 'Agent Notes',
	handler: mcpHandler,
	env: env as unknown as Env,
	url: 'https://notes.mcp.cloudflare.com',
	authenticated: true,
	authenticatedWorker: worker,
	expectedTools: ['read', 'write', 'search', 'run_reflection'],
})

describe('Agent Notes application state boundary', () => {
	it('keeps only the per-account search index Durable Object', () => {
		expect('MEMORY_INDEX' in env).toBe(true)
		expect('MCP_OBJECT' in env).toBe(false)
	})
})
