import type {
    ResourceGroupController,
    ResourceLease,
} from "../../application/resource/ResourceGroup";

export interface AudioSettings {
    readonly muted: boolean;
    readonly musicVolume: number;
    readonly soundVolume: number;
}

export interface AudioChannel {
    readonly isStopped?: boolean;
    stop(): void;
}

export interface AudioBackend {
    muted: boolean;
    musicVolume: number;
    soundVolume: number;
    playMusic(url: string, loops: number, complete: () => void): AudioChannel;
    playSound(url: string, loops: number, complete: () => void): AudioChannel;
    stopMusic(): void;
    stopAllSound(): void;
}

export interface AudioHandle {
    readonly id: number;
    readonly kind: "bgm" | "sfx";
    readonly url: string;
    readonly owner?: object | string;
    readonly stopped: boolean;
    stop(): void;
}

interface ActiveAudio {
    readonly handle: MutableAudioHandle;
    readonly channel: AudioChannel;
    readonly lease?: ResourceLease;
    readonly group?: string;
}

interface MutableAudioHandle extends AudioHandle {
    stoppedValue: boolean;
}

export interface AudioSnapshot {
    readonly bgm?: Readonly<Pick<AudioHandle, "id" | "url" | "stopped">>;
    readonly activeSfx: number;
}

export class AudioService {
    private readonly active = new Map<number, ActiveAudio>();
    private sequence = 0;
    private bgmId: number | undefined;
    private disposed = false;

    constructor(
        private readonly resources?: ResourceGroupController,
        private readonly backend: AudioBackend = new LayaAudioBackend(),
    ) {}

    applySettings(settings: AudioSettings): void {
        this.requireActive();
        this.backend.muted = settings.muted;
        this.backend.musicVolume = clampVolume(settings.musicVolume);
        this.backend.soundVolume = clampVolume(settings.soundVolume);
    }

    get settings(): AudioSettings {
        return {
            muted: this.backend.muted,
            musicVolume: this.backend.musicVolume,
            soundVolume: this.backend.soundVolume,
        };
    }

    playBgm(url: string, loops = 0, group = "audio:bgm"): AudioHandle {
        this.requireActive();
        this.stopBgm();
        const handle = this.play("bgm", url, loops, group);
        if (!handle.stopped) {
            this.bgmId = handle.id;
        }
        return handle;
    }

    stopBgm(): void {
        const id = this.bgmId;
        if (id === undefined) {
            return;
        }
        this.backend.stopMusic();
        this.finish(id, false);
    }

    playSfx(
        url: string,
        loops = 1,
        owner?: object | string,
        group = "audio:sfx",
    ): AudioHandle {
        this.requireActive();
        return this.play("sfx", url, loops, group, owner);
    }

    stopOwner(owner: object | string): void {
        for (const entry of Array.from(this.active.values())) {
            if (entry.handle.owner === owner) {
                this.finish(entry.handle.id, true);
            }
        }
    }

    stopAllSfx(): void {
        const ids = Array.from(this.active.values())
            .filter((entry) => entry.handle.kind === "sfx")
            .map((entry) => entry.handle.id);
        if (ids.length > 0) {
            this.backend.stopAllSound();
            for (const id of ids) {
                this.finish(id, false);
            }
        }
    }

    snapshot(): AudioSnapshot {
        const bgm = this.bgmId === undefined ? undefined : this.active.get(this.bgmId)?.handle;
        return Object.freeze({
            bgm: bgm ? Object.freeze({ id: bgm.id, url: bgm.url, stopped: bgm.stopped }) : undefined,
            activeSfx: Array.from(this.active.values())
                .filter((entry) => entry.handle.kind === "sfx").length,
        });
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.stopAllSfx();
        this.stopBgm();
        this.disposed = true;
    }

    private play(
        kind: "bgm" | "sfx",
        url: string,
        loops: number,
        group: string,
        owner?: object | string,
    ): AudioHandle {
        if (!url || !group) {
            throw new Error("Audio url and group are required.");
        }
        if (!Number.isInteger(loops) || loops < 0) {
            throw new Error("Audio loops must be a non-negative integer.");
        }
        this.resources?.assign(url, group);
        const lease = this.resources?.acquire(group);
        const id = ++this.sequence;
        let completed = false;
        const complete = (): void => {
            completed = true;
            this.finish(id, false);
        };
        try {
            const channel = kind === "bgm"
                ? this.backend.playMusic(url, loops, complete)
                : this.backend.playSound(url, loops, complete);
            const handle: MutableAudioHandle = {
                id,
                kind,
                url,
                owner,
                stoppedValue: false,
                get stopped() { return this.stoppedValue; },
                stop: () => this.finish(id, true),
            };
            this.active.set(id, { handle, channel, lease, group });
            if (completed) {
                this.finish(id, false);
            }
            return handle;
        } catch (error) {
            lease?.release();
            this.resources?.releaseGroupIfUnused(group);
            throw error;
        }
    }

    private finish(id: number, stopChannel: boolean): void {
        const entry = this.active.get(id);
        if (!entry) {
            return;
        }
        this.active.delete(id);
        entry.handle.stoppedValue = true;
        if (this.bgmId === id) {
            this.bgmId = undefined;
        }
        if (stopChannel && !entry.channel.isStopped) {
            entry.channel.stop();
        }
        entry.lease?.release();
        if (entry.group) {
            this.resources?.releaseGroupIfUnused(entry.group);
        }
    }

    private requireActive(): void {
        if (this.disposed) {
            throw new Error("AudioService has been disposed.");
        }
    }
}

export class LayaAudioBackend implements AudioBackend {
    get muted(): boolean {
        return Laya.SoundManager.muted;
    }

    set muted(value: boolean) {
        Laya.SoundManager.muted = value;
    }

    get musicVolume(): number {
        return Laya.SoundManager.musicVolume;
    }

    set musicVolume(value: number) {
        Laya.SoundManager.musicVolume = value;
    }

    get soundVolume(): number {
        return Laya.SoundManager.soundVolume;
    }

    set soundVolume(value: number) {
        Laya.SoundManager.soundVolume = value;
    }

    playMusic(url: string, loops: number, complete: () => void): Laya.SoundChannel {
        return Laya.SoundManager.playMusic(url, loops, complete);
    }

    playSound(url: string, loops: number, complete: () => void): Laya.SoundChannel {
        return Laya.SoundManager.playSound(url, loops, complete);
    }

    stopMusic(): void {
        Laya.SoundManager.stopMusic();
    }

    stopAllSound(): void {
        Laya.SoundManager.stopAllSound();
    }
}

function clampVolume(value: number): number {
    if (!Number.isFinite(value)) {
        throw new Error("Volume must be a finite number.");
    }
    return Math.min(1, Math.max(0, value));
}
