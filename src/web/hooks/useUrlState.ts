import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

export function useUrlState() {
	return useQueryStates(
		{
			s: parseAsString,
			v: parseAsStringLiteral(['chat', 'lead', 'ide'] as const).withDefault('chat'),
			p: parseAsStringLiteral(['chat', 'settings', 'skills', 'sources', 'profile'] as const).withDefault('chat'),
			tab: parseAsStringLiteral(['files', 'git', 'env'] as const).withDefault('files'),
		},
		{ history: 'push' },
	);
}
