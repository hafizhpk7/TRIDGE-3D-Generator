import { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, EmptyState } from '../design/components';

interface Props {
  /** What failed, in a few words: "The viewer", "This panel". */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches a crash (or a part of the app that failed to download) and offers a way forward. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ui]', error.message, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const download = /dynamically imported|Loading chunk|Failed to fetch|Importing a module/i.test(
      this.state.error.message,
    );
    return (
      <div role="alert">
        <EmptyState
          title={`${this.props.label} hit a problem`}
          action={
            <div className="boundary__actions">
              <Button onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                Reload the page
              </Button>
            </div>
          }
        >
          {download
            ? 'Part of the app could not be downloaded. Check your connection, then try again.'
            : 'Your projects are saved. Trying again usually fixes it; if not, reload the page.'}
        </EmptyState>
      </div>
    );
  }
}

/** A lazily loaded part of the page: shows a busy placeholder while it downloads and a retry if it fails. */
export function Lazy({
  label,
  children,
  fallback,
}: {
  label: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary label={label}>
      <Suspense
        fallback={
          fallback ?? (
            <p className="muted" role="status">
              Loading…
            </p>
          )
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
