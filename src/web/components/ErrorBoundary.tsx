import { Component, type ReactNode } from 'react';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
	override state: State = { hasError: false };

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error };
	}

	override render() {
		if (this.state.hasError) {
			return (
				this.props.fallback || (
					<div className="flex h-full items-center justify-center p-8">
						<div className="text-center">
							<p className="text-sm font-medium text-red-500 mb-2">Something went wrong</p>
							<p className="text-xs text-[var(--muted-foreground)]">{this.state.error?.message}</p>
							<button
								type="button"
								onClick={() => this.setState({ hasError: false })}
								className="mt-4 text-xs text-[var(--primary)] hover:underline"
							>
								Try again
							</button>
						</div>
					</div>
				)
			);
		}
		return this.props.children;
	}
}
