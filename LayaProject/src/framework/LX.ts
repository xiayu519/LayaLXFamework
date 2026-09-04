import { getLXRuntime, requireLXRuntime } from "./bootstrap/LXRuntimeHost";
import type { ApplicationRuntime } from "./bootstrap/createRuntime";

class LXFacade {
    get Ready(): boolean {
        return getLXRuntime()?.bootstrap.state === "running";
    }

    get UI(): ApplicationRuntime["ui"] {
        return requireLXRuntime().ui;
    }

    get Res(): typeof Laya.loader {
        requireLXRuntime();
        return Laya.loader;
    }

    get Content(): ApplicationRuntime["content"] {
        return requireLXRuntime().content;
    }

    get Config(): ApplicationRuntime["config"] {
        return requireLXRuntime().config;
    }

    get Storage(): ApplicationRuntime["settings"] {
        return requireLXRuntime().settings;
    }

    get Audio(): ApplicationRuntime["audio"] {
        return requireLXRuntime().audio;
    }

    get Pool(): ApplicationRuntime["pool"] {
        return requireLXRuntime().pool;
    }

    get Performance(): ApplicationRuntime["performance"] {
        return requireLXRuntime().performance;
    }

    get Scene(): typeof Laya.Scene {
        requireLXRuntime();
        return Laya.Scene;
    }

    get Net(): ApplicationRuntime["http"] {
        return requireLXRuntime().http;
    }

    get Platform(): ApplicationRuntime["platform"] {
        return requireLXRuntime().platform;
    }

    get Purchase(): ApplicationRuntime["purchase"] {
        return requireLXRuntime().purchase;
    }
}

export const LX = Object.freeze(new LXFacade());

declare global {
    // eslint-disable-next-line no-var
    var LX: LXFacade;
}

globalThis.LX = LX;
