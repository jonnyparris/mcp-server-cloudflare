import { createAuthenticatedMcpApp } from '@repo/mcp-common/src/mcp-app'
import { RequiredScopes } from '@repo/mcp-common/src/scopes'

import { registerMemoryTools } from './server'

import type { Env } from './agent-notes.context'

// Re-export the search-index Durable Object so wrangler can bind it.
export { MemoryIndex } from './search/durable-object'

const instructions = `Agent Notes — persistent, semantically-searchable notes for AI agents.

Store markdown notes, patterns, and learnings; retrieve them by meaning with
\`search\`. Files and their index are shared at the selected Cloudflare account
boundary. R2 storage and Workers AI inference are billed to that account. The
optional \`run_reflection\` tool applies low-risk fixes and stages substantive
changes for review; it is opt-out via \`set_config\`.`

// R2 object storage + Workers AI both run in the selected account via the
// Cloudflare REST API, so we request the scopes that grant them.
const AgentNotesScopes = {
	...RequiredScopes,
	'account:read': 'See your account info such as account details, analytics, and memberships.',
	'workers:write':
		'See and change Cloudflare Workers data such as zones, KV storage, namespaces, scripts, and routes (used for R2 object storage).',
	'ai:write':
		'See and change Workers AI catalog and assets (used to generate embeddings + reflections).',
} as const

const app = createAuthenticatedMcpApp<Env>({
	serverId: 'agent-notes',
	serviceHostnames: ['notes-staging.mcp.cloudflare.com', 'notes.mcp.cloudflare.com'],
	scopes: AgentNotesScopes,
	serverOptions: { instructions },
	register: registerMemoryTools,
})

export const mcpHandler = app.mcpHandler

export default app.worker
