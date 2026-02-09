export function normalizeSandboxPath(parentPath: string, entryPath: string): string {
	const parent = parentPath === '/' ? '' : parentPath.replace(/\/+$/, '');
	const child = entryPath.replace(/^\/+/, '');
	if (!parent) {
		return `/${child}`;
	}
	return `${parent}/${child}`;
}
