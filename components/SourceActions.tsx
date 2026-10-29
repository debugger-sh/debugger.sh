'use client';

import { ArrowDownToDot, ArrowUpFromDot, RedoDot } from 'lucide-react';

export type RunStopProps = {
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
};

/** Run / Stop for the main (source) dock title bar. */
export function RunStopButton({ isRunning, onRun, onStop }: RunStopProps) {
  if (!isRunning) {
    return (
      <button type="button" className="ide-run-btn" aria-label="Run" onClick={onRun}>
        <PlayIcon />
        Run
      </button>
    );
  }
  return (
    <button type="button" className="ide-stop-btn" aria-label="Stop" onClick={onStop}>
      <StopIcon />
      Stop
    </button>
  );
}

export type DebugControlsProps = {
  onContinue: () => void;
  onStepOver: () => void;
  onStepIn: () => void;
  onStepOut: () => void;
};

/** Continue / step controls — lives inside the variables pane body while paused. */
export function DebugControls({
  onContinue,
  onStepOver,
  onStepIn,
  onStepOut,
}: DebugControlsProps) {
  return (
    <div className="ide-debug-bar" role="toolbar" aria-label="Debug controls">
      <button
        type="button"
        className="ide-debug-continue"
        aria-label="Continue"
        onClick={onContinue}
      >
        <PlayIcon />
        Continue
      </button>
      <div className="ide-debug-group">
        <ActionBtn label="Step over" onClick={onStepOver}>
          <StepOverIcon />
        </ActionBtn>
        <ActionBtn label="Step into" onClick={onStepIn}>
          <StepIntoIcon />
        </ActionBtn>
        <ActionBtn label="Step out" onClick={onStepOut}>
          <StepOutIcon />
        </ActionBtn>
      </div>
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

const stepIconProps = {
  size: 13,
  strokeWidth: 1.75,
  'aria-hidden': true as const,
};

function StepOverIcon() {
  return <RedoDot {...stepIconProps} />;
}

function StepIntoIcon() {
  return <ArrowDownToDot {...stepIconProps} />;
}

function StepOutIcon() {
  return <ArrowUpFromDot {...stepIconProps} />;
}
