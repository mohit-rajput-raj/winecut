import { EditorProject, FramerSettings, TimelineClip } from './types';

export interface EditorSnapshot {
  project: EditorProject;
  framerSettings: FramerSettings;
  selectedClipId: string | null;
}

function cloneEditableSnapshot(snap: EditorSnapshot): EditorSnapshot {
  return {
    project: {
      ...snap.project,
      settings: { ...snap.project.settings },
      timeline: {
        ...snap.project.timeline,
        transitions: (snap.project.timeline.transitions || []).map((t) => ({ ...t })),
        tracks: snap.project.timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => ({
            ...clip,
            transform: { ...clip.transform },
            effects: (clip.effects || []).map((eff) => ({ ...eff })),
            animations: clip.animations
              ? {
                  in: clip.animations.in ? { ...clip.animations.in } : undefined,
                  out: clip.animations.out ? { ...clip.animations.out } : undefined,
                  middle: clip.animations.middle ? { ...clip.animations.middle } : undefined,
                }
              : undefined,
            mask: clip.mask ? { ...clip.mask } : undefined,
            speedCurve: clip.speedCurve
              ? {
                  presetId: clip.speedCurve.presetId,
                  points: clip.speedCurve.points.map((pt) => ({ ...pt })),
                }
              : undefined,
            layerEffects: clip.layerEffects ? [...clip.layerEffects] : undefined,
            gradientColors: clip.gradientColors ? [...clip.gradientColors] as [string, string] : undefined,
          })),
        })),
      },
      mediaLibrary: [...snap.project.mediaLibrary],
    },
    framerSettings: {
      ...snap.framerSettings,
      topBox: { ...snap.framerSettings.topBox },
      bottomBox: { ...snap.framerSettings.bottomBox },
    },
    selectedClipId: snap.selectedClipId,
  };
}

function computeSnapshotSignature(snap: EditorSnapshot): string {
  return JSON.stringify({
    name: snap.project.name,
    mode: snap.project.mode,
    settings: snap.project.settings,
    timeline: snap.project.timeline,
    framer: snap.framerSettings,
  });
}

/**
 * Whole-editor snapshot history supporting interactive pointer transactions
 * (1 undo entry on mouseDown -> mouseUp) and debounced coalescing for continuous typing/arrow adjustments.
 */
export class SnapshotHistoryManager {
  private past: { label: string; snapshot: EditorSnapshot; signature: string }[] = [];
  private future: { label: string; snapshot: EditorSnapshot; signature: string }[] = [];
  private maxHistory: number;
  private listeners: (() => void)[] = [];
  private activeTx: { label: string; before: EditorSnapshot; signature: string } | null = null;
  private lastCoalesce: { key: string; timestamp: number } | null = null;

  constructor(maxHistory: number = 60) {
    this.maxHistory = maxHistory;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((c) => c !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public isInTransaction(): boolean {
    return this.activeTx !== null;
  }

  public beginTransaction(current: EditorSnapshot, label: string = 'Edit'): void {
    if (this.activeTx) return;
    this.activeTx = {
      label,
      before: cloneEditableSnapshot(current),
      signature: computeSnapshotSignature(current),
    };
  }

  public endTransaction(current: EditorSnapshot): boolean {
    if (!this.activeTx) return false;
    const tx = this.activeTx;
    this.activeTx = null;

    const afterSig = computeSnapshotSignature(current);
    if (afterSig === tx.signature) {
      return false;
    }

    this.past.push({
      label: tx.label,
      snapshot: tx.before,
      signature: tx.signature,
    });
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.future = [];
    this.lastCoalesce = null;
    this.notify();
    return true;
  }

  public record(
    before: EditorSnapshot,
    after: EditorSnapshot,
    options?: { label?: string; coalesceKey?: string; skipHistory?: boolean }
  ): void {
    if (options?.skipHistory || this.activeTx) return;

    const beforeSig = computeSnapshotSignature(before);
    const afterSig = computeSnapshotSignature(after);
    if (beforeSig === afterSig) return;

    const now = Date.now();
    if (
      options?.coalesceKey &&
      this.lastCoalesce?.key === options.coalesceKey &&
      now - this.lastCoalesce.timestamp < 450 &&
      this.past.length > 0
    ) {
      this.lastCoalesce.timestamp = now;
      this.future = [];
      this.notify();
      return;
    }

    this.past.push({
      label: options?.label || 'Edit',
      snapshot: cloneEditableSnapshot(before),
      signature: beforeSig,
    });
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.future = [];
    this.lastCoalesce = options?.coalesceKey ? { key: options.coalesceKey, timestamp: now } : null;
    this.notify();
  }

  public undo(current: EditorSnapshot): EditorSnapshot | null {
    this.activeTx = null;
    const entry = this.past.pop();
    if (!entry) return null;

    this.future.push({
      label: entry.label,
      snapshot: cloneEditableSnapshot(current),
      signature: computeSnapshotSignature(current),
    });
    this.lastCoalesce = null;
    this.notify();
    return cloneEditableSnapshot(entry.snapshot);
  }

  public redo(current: EditorSnapshot): EditorSnapshot | null {
    this.activeTx = null;
    const entry = this.future.pop();
    if (!entry) return null;

    this.past.push({
      label: entry.label,
      snapshot: cloneEditableSnapshot(current),
      signature: computeSnapshotSignature(current),
    });
    this.lastCoalesce = null;
    this.notify();
    return cloneEditableSnapshot(entry.snapshot);
  }

  public clear(): void {
    this.activeTx = null;
    this.past = [];
    this.future = [];
    this.lastCoalesce = null;
    this.notify();
  }
}

export interface ICommand {
  description: string;
  execute(): void;
  undo(): void;
}

export class HistoryManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxHistory: number = 50;
  private onChangeCallbacks: (() => void)[] = [];

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  public subscribe(cb: () => void): () => void {
    this.onChangeCallbacks.push(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter(c => c !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.onChangeCallbacks) {
      cb();
    }
  }

  public execute(command: ICommand): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // clear redo on new action
    this.notify();
  }

  public undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    this.notify();
    return true;
  }

  public redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    this.notify();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoStackDescriptions(): string[] {
    return this.undoStack.map(c => c.description);
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

// Concrete Commands matching the Roadmap Design
export class UpdateClipPropertyCommand<T extends keyof TimelineClip> implements ICommand {
  public description: string;
  private prevValue: TimelineClip[T];

  constructor(
    private clipId: string,
    private property: T,
    private newValue: TimelineClip[T],
    private updateFn: (clipId: string, key: T, val: TimelineClip[T]) => void,
    currentValue: TimelineClip[T]
  ) {
    this.prevValue = currentValue;
    this.description = `Update ${String(property)} of clip`;
  }

  execute(): void {
    this.updateFn(this.clipId, this.property, this.newValue);
  }

  undo(): void {
    this.updateFn(this.clipId, this.property, this.prevValue);
  }
}

export class MoveClipCommand implements ICommand {
  public description: string;

  constructor(
    private clipId: string,
    private prevStart: number,
    private newStart: number,
    private moveFn: (clipId: string, time: number) => void
  ) {
    this.description = `Move clip to ${newStart.toFixed(1)}s`;
  }

  execute(): void {
    this.moveFn(this.clipId, this.newStart);
  }

  undo(): void {
    this.moveFn(this.clipId, this.prevStart);
  }
}

export class TrimClipCommand implements ICommand {
  public description: string;

  constructor(
    private clipId: string,
    private prevStart: number,
    private prevEnd: number,
    private newStart: number,
    private newEnd: number,
    private trimFn: (clipId: string, start: number, end: number) => void
  ) {
    this.description = `Trim clip duration`;
  }

  execute(): void {
    this.trimFn(this.clipId, this.newStart, this.newEnd);
  }

  undo(): void {
    this.trimFn(this.clipId, this.prevStart, this.prevEnd);
  }
}

export class TrimClipTimelineCommand implements ICommand {
  public description: string;

  constructor(
    private clipId: string,
    private prevTimelineStart: number,
    private prevDuration: number,
    private prevSourceStart: number,
    private prevSourceEnd: number,
    private newTimelineStart: number,
    private newDuration: number,
    private newSourceStart: number,
    private newSourceEnd: number,
    private trimFn: (clipId: string, tStart: number, dur: number, sStart: number, sEnd: number) => void
  ) {
    this.description = `Trim clip in/out points`;
  }

  execute(): void {
    this.trimFn(this.clipId, this.newTimelineStart, this.newDuration, this.newSourceStart, this.newSourceEnd);
  }

  undo(): void {
    this.trimFn(this.clipId, this.prevTimelineStart, this.prevDuration, this.prevSourceStart, this.prevSourceEnd);
  }
}

export class MoveClipToTrackCommand implements ICommand {
  public description: string;

  constructor(
    private clipId: string,
    private prevTrackId: string,
    private prevStart: number,
    private newTrackId: string,
    private newStart: number,
    private moveFn: (clipId: string, trackId: string, time: number) => void
  ) {
    this.description = `Move clip across tracks`;
  }

  execute(): void {
    this.moveFn(this.clipId, this.newTrackId, this.newStart);
  }

  undo(): void {
    this.moveFn(this.clipId, this.prevTrackId, this.prevStart);
  }
}
