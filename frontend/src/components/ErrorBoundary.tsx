import type { ReactNode } from "react";
import { Component } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Keep visible signal in console for event-day debugging.
    // eslint-disable-next-line no-console
    console.error("UI crash captured", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
          <section className="glass-card w-full rounded-3xl p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Recovery Mode</p>
            <h1 className="mt-2 text-3xl font-semibold">Interface recovered from an error</h1>
            <p className="mt-3 text-sm text-slate-300">Reload the page to restore live session state from backend.</p>
            <button className="apple-btn mt-6" onClick={() => window.location.reload()}>
              Reload Interface
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
