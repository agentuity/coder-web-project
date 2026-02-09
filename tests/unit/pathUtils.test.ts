import { describe, expect, test } from 'bun:test';
import { normalizeSandboxPath } from '../../src/lib/path-utils';

describe('normalizeSandboxPath', () => {
	test('joins root parent with child', () => {
		expect(normalizeSandboxPath('/', 'src/index.ts')).toBe('/src/index.ts');
	});

	test('removes duplicate slashes when joining', () => {
		expect(normalizeSandboxPath('/src/', '/nested/file.ts')).toBe('/src/nested/file.ts');
	});
});
