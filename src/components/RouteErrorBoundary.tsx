import React from 'react';
import { useStrings } from '../i18n';

/* Route-level error boundary (2026-10-12).

   Why: a wedged vite dep cache (blank-page incident 2026-10-11) showed that
   any uncaught render-phase error — including a rejected React.lazy import —
   unmounts the ENTIRE tree, blanking sidebar and topbar along with the page.
   This boundary is mounted by App.tsx around each <Routes> block, keyed by
   location.pathname, so:

   - the failure degrades to a calm panel inside the shell (chrome survives);
   - navigating to another route remounts a fresh boundary (auto-recovery);
   - the reload button covers the chunk-rejection case, because React.lazy
     caches the rejected promise — resetting boundary state alone would just
     rethrow it, while a document reload refetches HTML + fresh dep hashes.

   The fallback is a function component so it can consume useStrings();
   class components cannot use hooks. */

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

function RouteErrorPanel({ error }: { error: Error }) {
  const t = useStrings();
  return (
    <div className="route-error" role="alert">
      <h2 className="route-error-title">{t.routeErrorTitle}</h2>
      <p className="route-error-body">{t.routeErrorBody}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => window.location.reload()}
      >
        {t.routeErrorReload}
      </button>
      <details className="route-error-details">
        <summary>{t.routeErrorDetails}</summary>
        <code>{error.message}</code>
      </details>
    </div>
  );
}

export default class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // React logs the component stack itself; this breadcrumb tags it with
    // the boundary name so console probes can attribute the failure.
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <RouteErrorPanel error={this.state.error} />;
    }
    return this.props.children;
  }
}
