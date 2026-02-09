import { useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath?: string;
  onSelect?: (path: string) => void;
}

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  return (
    <div className="text-xs">
      {nodes.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath?: string;
  onSelect?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedPath === node.path;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          className={`flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--accent)] ${
            isSelected ? 'bg-[var(--accent)]' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-[var(--primary)]" />
          )}
          <span>{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--accent)] ${
        isSelected ? 'bg-[var(--accent)]' : ''
      }`}
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
      onClick={() => onSelect?.(node.path)}
    >
      <File className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      <span>{node.name}</span>
    </button>
  );
}
