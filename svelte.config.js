import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, strict: true }),
		// SvelteKit boots each prerendered page with a small inline script. In hash mode it
		// emits a <meta> CSP listing that script's hash, so no 'unsafe-inline' is needed for
		// scripts. vercel.json adds the rest of the policy as a response header.
		csp: {
			mode: 'hash',
			directives: {
				'script-src': ['self']
			}
		}
	}
};

export default config;
