import { describe, expect, test } from 'bun:test';
import { parseFileOutput } from '../../src/web/lib/file-output';

describe('parseFileOutput', () => {
	test('strips file tags, line numbers, and footer', () => {
		const input = `<file>\n00001| function foo() {\n00002|   return 1;\n00003| }\n\n(End of file - total 3 lines)\n</file>`;
		const result = parseFileOutput(input);
		expect(result).toBe('function foo() {\n  return 1;\n}');
	});

	test('handles output without tags and preserves content', () => {
		const input = `00001| const name = 'Ada';\n00002| console.log(name);`;
		const result = parseFileOutput(input);
		expect(result).toBe("const name = 'Ada';\nconsole.log(name);");
	});
});
