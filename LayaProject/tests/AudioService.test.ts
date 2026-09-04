import { describe, expect, it, vi } from "vitest";
import {
    AudioService,
    type AudioBackend,
    type AudioChannel,
} from "../src/framework/infrastructure/audio/AudioService";
import type { ResourceGroupController } from "../src/framework/application/resource/ResourceGroup";

interface FakeChannel extends AudioChannel {
    readonly stopMock: ReturnType<typeof vi.fn>;
    complete(success?: boolean): void;
}

function harness() {
    const channels: FakeChannel[] = [];
    const createChannel = (complete: () => void): FakeChannel => {
        const stopMock = vi.fn();
        const channel: FakeChannel = {
            isStopped: false,
            stop: () => stopMock(),
            stopMock,
            complete: () => complete(),
        };
        channels.push(channel);
        return channel;
    };
    const backend: AudioBackend = {
        muted: false,
        musicVolume: 1,
        soundVolume: 1,
        playMusic: vi.fn((_url, _loops, complete) => createChannel(complete)),
        playSound: vi.fn((_url, _loops, complete) => createChannel(complete)),
        stopMusic: vi.fn(),
        stopAllSound: vi.fn(),
    };
    const leases: Array<{ group: string; released: boolean }> = [];
    const resources: ResourceGroupController = {
        assign: vi.fn(),
        acquire: vi.fn((group) => {
            const state = { group, released: false };
            leases.push(state);
            return {
                group,
                get released() { return state.released; },
                release: () => { state.released = true; },
            };
        }),
        releaseGroupIfUnused: vi.fn(() => true),
    };
    return { service: new AudioService(resources, backend), backend, channels, leases, resources };
}

describe("AudioService", () => {
    it("tracks ownership and releases completed sound resources", () => {
        const { service, channels, leases, resources } = harness();
        const owner = {};
        const first = service.playSfx("audio/click.wav", 1, owner, "audio:screen");
        service.playSfx("audio/other.wav", 1, "other", "audio:screen");

        expect(service.snapshot().activeSfx).toBe(2);
        channels[0].complete();
        expect(first.stopped).toBe(true);
        expect(leases[0].released).toBe(true);

        service.stopOwner("other");
        expect(channels[1].stopMock).toHaveBeenCalledOnce();
        expect(service.snapshot().activeSfx).toBe(0);
        expect(resources.releaseGroupIfUnused).toHaveBeenCalledTimes(2);
    });

    it("replaces BGM and preserves settings", () => {
        const { service, backend, channels } = harness();
        service.applySettings({ muted: true, musicVolume: 2, soundVolume: -1 });
        const first = service.playBgm("audio/one.mp3");
        const second = service.playBgm("audio/two.mp3");

        expect(service.settings).toEqual({ muted: true, musicVolume: 1, soundVolume: 0 });
        expect(first.stopped).toBe(true);
        expect(backend.stopMusic).toHaveBeenCalledOnce();
        expect(second.stopped).toBe(false);
        service.stopBgm();
        expect(backend.stopMusic).toHaveBeenCalledTimes(2);
    });
});
