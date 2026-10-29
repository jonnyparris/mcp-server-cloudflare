import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { registerMemoryTools } from './server'

import type { ZodRawShape } from 'zod'
import type { AccountToolCallback } from '@repo/mcp-common/src/account-tool'
import type { AuthProps } from '@repo/mcp-common/src/auth-props'
import type { McpRegistrationContext } from '@repo/mcp-common/src/registration-context'
import type { Env } from './agent-notes.context'

function registeredSchemas() {
	const schemas = new Map<string, ZodRawShape>()
	const context = {
		env: {} as Env,
		accountTool(name: string, config: { inputSchema: z.ZodObject<ZodRawShape> }) {
			schemas.set(name, config.inputSchema.shape)
		},
	} as unknown as McpRegistrationContext<Env>
	registerMemoryTools(context)
	return schemas
}

describe('Agent Notes tool registration', () => {
	it('registers the curated managed-server tool surface', () => {
		const schemas = registeredSchemas()

		expect([...schemas.keys()]).toEqual([
			'read',
			'write',
			'write_many',
			'reindex',
			'list',
			'list_tags',
			'search',
			'get_backlinks',
			'search_conversations',
			'index_conversations',
			'expand_conversation',
			'conversation_stats',
			'schedule_reminder',
			'list_reminders',
			'remove_reminder',
			'check_reminders',
			'run_reflection',
			'list_pending_reflections',
			'apply_reflection_changes',
			'archive_reflection',
			'get_config',
			'set_config',
		])
	})

	it('blocks traversal and direct writes to managed internal state', () => {
		const schemas = registeredSchemas()
		const write = z.object(schemas.get('write')!)
		const read = z.object(schemas.get('read')!)

		expect(write.safeParse({ path: '../../bucket/object', content: 'bad' }).success).toBe(false)
		expect(write.safeParse({ path: '.mcp/config.json', content: 'bad' }).success).toBe(false)
		expect(
			write.safeParse({ path: 'memory/reflections/pending/fake.md', content: 'bad' }).success
		).toBe(false)
		expect(read.safeParse({ path: '.mcp/config.json' }).success).toBe(false)
		expect(read.safeParse({ path: 'memory/reflections/pending/2026-07-17.md' }).success).toBe(true)
		const writeMany = z.object(schemas.get('write_many')!)
		expect(
			writeMany.safeParse({
				files: [
					{ path: 'memory/same.md', content: 'first' },
					{ path: 'memory/same.md', content: 'second' },
				],
			}).success
		).toBe(false)
	})

	it('bounds and validates conversation sync batches', () => {
		const schema = z.object(registeredSchemas().get('index_conversations')!)
		const session = {
			sessionId: 'session-1',
			project: 'project',
			data: {
				messages: [
					{ role: 'user', content: 'Question' },
					{ role: 'assistant', content: 'Answer' },
				],
			},
		}

		expect(schema.safeParse({ sessions: [session] }).success).toBe(true)
		expect(schema.safeParse({ sessions: [session, session] }).success).toBe(false)
		expect(
			schema.safeParse({ sessions: [{ ...session, data: { messages: 'not-an-array' } }] }).success
		).toBe(false)
	})
})

type ToolCallback = AccountToolCallback<ZodRawShape>

function registeredCallbacks(props?: AuthProps) {
	const callbacks = new Map<string, ToolCallback>()
	const memoryIndex = {
		idFromName: (name: string) => name,
		get: () => ({}),
	}
	const context = {
		env: {
			AGENT_NOTES_BUCKET_NAME: 'agent-notes-mcp',
			MEMORY_INDEX: memoryIndex,
		} as unknown as Env,
		props,
		executionCtx: { waitUntil: () => {} },
		accountTool(name: string, _config: unknown, callback: ToolCallback) {
			callbacks.set(name, callback)
		},
	} as unknown as McpRegistrationContext<Env>
	registerMemoryTools(context)
	return callbacks
}

const userProps = {
	type: 'user_token',
	accessToken: 'oauth-access-token',
	user: { id: 'user-1', email: 'user@example.com' },
	accounts: [{ id: 'account-1', name: 'Account 1' }],
} as unknown as AuthProps

describe('Agent Notes account-scoped tool wrapper', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reads from the selected account bucket with the OAuth token', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('# hello', { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		const read = registeredCallbacks(userProps).get('read')!
		const result = await read({ path: 'memory/a.md' }, 'account-1', {} as never)

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
		expect(url).toBe(
			'https://api.cloudflare.com/client/v4/accounts/account-1/r2/buckets/agent-notes-mcp/objects/memory/a.md'
		)
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer oauth-access-token')
		expect(result).not.toHaveProperty('isError', true)
		expect(JSON.stringify(result)).toContain('# hello')
	})

	it('returns a tool error naming the tool when the handler throws', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

		const read = registeredCallbacks(userProps).get('read')!
		const result = await read({ path: 'memory/a.md' }, 'account-1', {} as never)

		expect(result).toHaveProperty('isError', true)
		expect(JSON.stringify(result)).toContain('read failed')
	})

	it('returns a tool error without calling Cloudflare when request props are missing', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		const read = registeredCallbacks(undefined).get('read')!
		const result = await read({ path: 'memory/a.md' }, 'account-1', {} as never)

		expect(result).toHaveProperty('isError', true)
		expect(JSON.stringify(result)).toContain('Authenticated request props are required')
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
