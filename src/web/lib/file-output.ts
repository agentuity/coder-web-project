export function parseFileOutput(output: string): string {
	return output
		.replace(/^<file>\n?/, '')
		.replace(/\n?<\/file>$/, '')
		.replace(/\n?\(End of file[^\)]*\)\s*$/, '')
		.split('\n')
		.map((line) => line.replace(/^\d{5}\| ?/, ''))
		.join('\n')
		.trim();
}
