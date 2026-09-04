import { getLXRuntime, requireLXRuntime } from "./bootstrap/LXRuntimeHost";
import type { ApplicationRuntime } from "./bootstrap/createRuntime";

class LXFacade {
    get Ready(): boolean {
        return getLXRuntime()?.bootstrap.state === "running";
    }

    get App(): ApplicationRuntime {
        return requireLXRuntime();
    }

    get UI(): ApplicationRuntime["ui"] {
        return requireLXRuntime().ui;
    }

    get Res(): ApplicationRuntime["resources"] {
        return requireLXRuntime().resources;
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

    get Spine(): ApplicationRuntime["spine"] {
        return requireLXRuntime().spine;
    }

    get Performance(): ApplicationRuntime["performance"] {
        return requireLXRuntime().performance;
    }

    get Scene(): ApplicationRuntime["scenes"] {
        return requireLXRuntime().scenes;
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
