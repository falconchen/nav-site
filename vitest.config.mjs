import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.spec.js'],
	},
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			// 单元测试已模拟 AI / fetch，不需要连接远程 Workers AI。
			remoteBindings: false,
		}),
	],
});
