import { CheckIcon, CopyIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: string;
	showLineNumbers?: boolean;
};

type CodeBlockContextType = {
	code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({ code: '' });

export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	const lines = useMemo(() => code.split('\n'), [code]);

	return (
		<CodeBlockContext.Provider value={{ code }}>
			<div
				className={cn(
					'group relative w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]',
					className
				)}
				{...props}
			>
				<div className="absolute left-3 top-2 text-[10px] font-mono text-[var(--muted-foreground)]">
					{language}
				</div>
				<pre className="overflow-x-auto px-4 pb-4 pt-6 text-xs leading-relaxed">
					<code>
						{lines.map((line, index) => (
							<div key={`${index}-${line}`} className="whitespace-pre">
								{showLineNumbers && (
									<span className="mr-3 inline-block w-6 select-none text-right text-[var(--muted-foreground)]">
										{index + 1}
									</span>
								)}
								{line}
							</div>
						))}
					</code>
				</pre>
				{children && (
					<div className="absolute right-2 top-2 flex items-center gap-2">
						{children}
					</div>
				)}
			</div>
		</CodeBlockContext.Provider>
	);
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const CodeBlockCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const { code } = useContext(CodeBlockContext);

	const copyToClipboard = async () => {
		if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
			onError?.(new Error('Clipboard API not available'));
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			onCopy?.();
			setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	const Icon = isCopied ? CheckIcon : CopyIcon;

	return (
		<Button
			className={cn(
				'h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100',
				className
			)}
			onClick={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? <Icon className="h-3.5 w-3.5" />}
		</Button>
	);
};
