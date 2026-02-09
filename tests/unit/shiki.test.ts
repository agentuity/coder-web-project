import { describe, expect, test } from 'bun:test';
import { getLangFromExt, getLangFromPath } from '../../src/web/lib/shiki';

describe('shiki language detection', () => {
	test('maps known extensions to languages', () => {
		expect(getLangFromExt('ts')).toBe('typescript');
		expect(getLangFromExt('yml')).toBe('yaml');
		expect(getLangFromExt('svg')).toBe('xml');
	});

	test('falls back to text for unknown extensions', () => {
		expect(getLangFromExt('unknown')).toBe('text');
		expect(getLangFromPath('/tmp/file.unknown')).toBe('text');
	});
});
