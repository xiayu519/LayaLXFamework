import type { SaveSchema } from "../infrastructure/storage/SaveStore";
import type { AudioSettings } from "../infrastructure/audio/AudioService";

export interface ClientSettings extends AudioSettings {
    readonly language: string;
}

export const SETTINGS_SCHEMA: SaveSchema<ClientSettings> = {
    key: "lx.client-settings",
    currentVersion: 1,
    createDefault: () => ({
        language: "zh-CN",
        muted: false,
        musicVolume: 1,
        soundVolume: 1,
    }),
    validate(value: unknown): value is ClientSettings {
        if (!value || typeof value !== "object") {
            return false;
        }
        const item = value as Partial<ClientSettings>;
        return typeof item.language === "string"
            && typeof item.muted === "boolean"
            && isVolume(item.musicVolume)
            && isVolume(item.soundVolume);
    },
};

function isVolume(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
