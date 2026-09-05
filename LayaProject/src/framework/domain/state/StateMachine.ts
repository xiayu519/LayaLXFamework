export interface StateTransition<TState, TEvent, TPayload = void> {
    readonly from: TState;
    readonly event: TEvent;
    readonly to: TState;
    guard?(payload: TPayload, state: TState): boolean;
    effect?(payload: TPayload, transition: StateTransitionResult<TState, TEvent>): void;
}

export interface StateTransitionResult<TState, TEvent> {
    readonly from: TState;
    readonly event: TEvent;
    readonly to: TState;
    readonly sequence: number;
}

export interface StateMachineSnapshot<TState> {
    readonly state: TState;
    readonly sequence: number;
}

export class InvalidStateTransitionError extends Error {
    constructor(readonly state: unknown, readonly event: unknown) {
        super(`No state transition accepts event '${String(event)}' from '${String(state)}'.`);
        this.name = "InvalidStateTransitionError";
    }
}

export class StateMachine<TState, TEvent, TPayload = void> {
    private currentState: TState;
    private sequenceValue = 0;
    private dispatching = false;

    constructor(
        initialState: TState,
        private readonly transitions: readonly StateTransition<TState, TEvent, TPayload>[],
    ) {
        this.currentState = initialState;
    }

    get state(): TState {
        return this.currentState;
    }

    get sequence(): number {
        return this.sequenceValue;
    }

    can(event: TEvent, payload: TPayload): boolean {
        this.beginOperation();
        try {
            return this.findCandidates(event, payload).length === 1;
        } finally {
            this.dispatching = false;
        }
    }

    dispatch(event: TEvent, payload: TPayload): StateTransitionResult<TState, TEvent> {
        this.beginOperation();
        try {
            const candidates = this.findCandidates(event, payload);
            if (candidates.length === 0) {
                throw new InvalidStateTransitionError(this.currentState, event);
            }
            if (candidates.length > 1) {
                throw new Error(`Ambiguous state transition for event '${String(event)}'.`);
            }

            const transition = candidates[0];
            const result: StateTransitionResult<TState, TEvent> = Object.freeze({
                from: this.currentState,
                event,
                to: transition.to,
                sequence: this.sequenceValue + 1,
            });
            transition.effect?.(payload, result);
            this.currentState = transition.to;
            this.sequenceValue = result.sequence;
            return result;
        } finally {
            this.dispatching = false;
        }
    }

    snapshot(): StateMachineSnapshot<TState> {
        return Object.freeze({ state: this.currentState, sequence: this.sequenceValue });
    }

    private beginOperation(): void {
        if (this.dispatching) {
            throw new Error("StateMachine does not allow reentrant can/dispatch.");
        }
        this.dispatching = true;
    }

    private findCandidates(event: TEvent, payload: TPayload): StateTransition<TState, TEvent, TPayload>[] {
        return this.transitions.filter((transition) => transition.from === this.currentState
            && transition.event === event
            && (transition.guard?.(payload, this.currentState) ?? true));
    }
}
