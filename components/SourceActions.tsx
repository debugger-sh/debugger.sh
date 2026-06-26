'use client';

export type SourceActionsProps = {
  isRunning: boolean;
  isPaused: boolean;
  onRun: () => void;
  onStop: () => void;
  onContinue: () => void;
  onStepOver: () => void;
  onStepIn: () => void;
  onStepOut: () => void;
};

export function SourceActions(p: SourceActionsProps) {
  return (
    <div className="ide-toolbar">
      {!p.isRunning && (
        <button type="button" className="ide-run-btn" aria-label="Run" onClick={p.onRun}>
          <PlayIcon />
          Run
        </button>
      )}
      {p.isPaused && (
        <div className="ide-debug-group">
          <button
            type="button"
            className="ide-debug-continue"
            aria-label="Continue"
            onClick={p.onContinue}
          >
            <PlayIcon />
            Continue
          </button>
          <ActionBtn label="Step over" onClick={p.onStepOver}>
            <StepOverIcon />
          </ActionBtn>
          <ActionBtn label="Step into" onClick={p.onStepIn}>
            <StepIntoIcon />
          </ActionBtn>
          <ActionBtn label="Step out" onClick={p.onStepOut}>
            <StepOutIcon />
          </ActionBtn>
        </div>
      )}
      {p.isRunning && (
        <button type="button" className="ide-stop-btn" aria-label="Stop" onClick={p.onStop}>
          <StopIcon />
          Stop
        </button>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ide-action-btn ide-action-btn--primary"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 11 11" fill="currentColor" aria-hidden>
      <path d="M3 2 L9 5.5 L3 9 Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 11 11" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2.5" width="6" height="6" />
    </svg>
  );
}

function StepOverIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 7 Q6.5 1.5 11 7" />
      <path d="M11 7 L8.7 5.6 M11 7 L9.2 8.6" />
      <circle cx="6.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StepIntoIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.5 2 L6.5 8" />
      <path d="M3.8 5.5 L6.5 8.5 L9.2 5.5" />
      <circle cx="6.5" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StepOutIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.5 8 L6.5 2" />
      <path d="M3.8 4.5 L6.5 1.5 L9.2 4.5" />
      <circle cx="6.5" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
