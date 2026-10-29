import type { Env } from '../agent-notes.context'

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}
