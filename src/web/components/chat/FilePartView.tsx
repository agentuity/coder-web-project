import { useState } from 'react';
import { FileText, ImageIcon } from 'lucide-react';
import type { FilePart } from '../../types/opencode';

interface FilePartViewProps {
	part: FilePart;
	sessionId?: string;
}

export function FilePartView({ part, sessionId }: FilePartViewProps) {
	const isImage = part.mime?.startsWith('image/');
	const [imgError, setImgError] = useState(false);

	// Determine image src: data URLs use directly, file paths fetch from backend
	const isDataUrl = part.url?.startsWith('data:');
	const isFileUrl = part.url?.startsWith('file://');
	const filePath = isFileUrl ? part.url.slice(7) : !isDataUrl ? part.url : undefined;
	const imageSrc = isImage
		? isDataUrl
			? part.url
			: sessionId && filePath
				? `/api/sessions/${sessionId}/files/image?path=${encodeURIComponent(filePath)}`
				: undefined
		: undefined;

	return (
		<div className="flex flex-col gap-1.5">
			{imageSrc && !imgError && (
				<img
					src={imageSrc}
					alt={part.filename || 'Image attachment'}
					loading="lazy"
					className="max-w-sm max-h-64 rounded-lg border border-[var(--border)] object-contain"
					onError={() => setImgError(true)}
				/>
			)}
			<div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
				{isImage ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
				<span className="font-mono">{part.filename || part.url}</span>
			</div>
		</div>
	);
}
