import { describe, expect, it, vi } from "vitest";
import {
    AudioService,
    type AudioBackend,
    type AudioChannel,
} from "../src/framework/infrastructure/audio/AudioService";

interface FakeChannel extends AudioChannel {
    readonly stopMock: ReturnType<typeof vi.fn>;
    complete(): void;
}

function harness() {
    const channels: FakeChannel[] = [];
    const createChannel = (complete: () => void): FakeChannel => {
        const stopMock = vi.fn();
        const channel: FakeChannel = {
            isStopped: false,
            stop: () => stopMock(),
            stopMock,
            complete,
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
    return { service: new AudioService(backend), backend, channels };
}

describe("AudioService", () => {
    it("tracks owner-scoped channels and handles native completion", () => {
        const { service, channels } = harness();
        const owner = {};
        const first = service.playSfx("audio/click.wav", 1, owner);
        service.playSfx("audio/other.wav", 1, "other");

        expect(service.snapshot().activeSfx).toBe(2);
        channels[0].complete();
        expect(first.stopped).toBe(true);

        service.stopOwner("other");
        expect(channels[1].stopMock).toHaveBeenCalledOnce();
        expect(service.snapshot().activeSfx).toBe(0);
    });

    it("replaces BGM and preserves clamped settings", () => {
        const { service, backend } = harness();
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
