import { getLxRuntime, requireLxRuntime } from "./bootstrap/lxRuntimeHost";
import type { ApplicationRuntime } from "./bootstrap/createRuntime";

class LxFacade {
    /** Stop the application and release its owners, independently of any scene. */
    stop(): Promise<void> {
        return getLxRuntime()?.stop() ?? Promise.resolve();
    }

    snapshot(): ReturnType<ApplicationRuntime["snapshot"]> {
        return requireLxRuntime().snapshot();
    }

    get ready(): boolean {
        return getLxRuntime()?.bootstrap.state === "running";
    }

    get ui(): ApplicationRuntime["ui"] {
        return requireLxRuntime().ui;
    }

    get scenes(): ApplicationRuntime["scenes"] {
        return requireLxRuntime().scenes;
    }

    get worlds(): ApplicationRuntime["worlds"] {
        return requireLxRuntime().worlds;
    }

    get data(): ApplicationRuntime["data"] {
        return requireLxRuntime().data;
    }

    get res(): typeof Laya.loader {
        requireLxRuntime();
        return Laya.loader;
    }

    get content(): ApplicationRuntime["content"] {
        return requireLxRuntime().content;
    }

    get config(): ApplicationRuntime["config"] {
        return requireLxRuntime().config;
    }

    get tables(): ApplicationRuntime["tables"] {
        return requireLxRuntime().tables;
    }

    get storage(): ApplicationRuntime["settings"] {
        return requireLxRuntime().settings;
    }

    get audio(): ApplicationRuntime["audio"] {
        return requireLxRuntime().audio;
    }

    get pool(): ApplicationRuntime["pool"] {
        return requireLxRuntime().pool;
    }

    get performance(): ApplicationRuntime["performance"] {
        return requireLxRuntime().performance;
    }

    get net(): ApplicationRuntime["http"] {
        return requireLxRuntime().http;
    }

    get platform(): ApplicationRuntime["platform"] {
        return requireLxRuntime().platform;
    }

    get purchase(): ApplicationRuntime["purchase"] {
        return requireLxRuntime().purchase;
    }
}

export const lx = Object.freeze(new LxFacade());

declare global {
    // eslint-disable-next-line no-var
    var lx: LxFacade;
}

globalThis.lx = lx;
