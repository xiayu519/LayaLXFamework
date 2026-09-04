export interface SceneRoute {
    readonly id: string;
    readonly url: string;
}

export interface SceneDriver<TScene> {
    open(url: string, params?: unknown): Promise<TScene>;
    close(scene: TScene): void;
}

export class StaleSceneNavigationError extends Error {
    constructor(readonly routeId: string) {
        super(`Scene navigation to '${routeId}' was superseded.`);
        this.name = "StaleSceneNavigationError";
    }
}

export class SceneRouter<TScene> {
    private readonly routes = new Map<string, SceneRoute>();
    private navigationVersion = 0;
    private currentScene: TScene | undefined;
    private currentRouteId: string | undefined;

    constructor(
        routes: readonly SceneRoute[],
        private readonly driver: SceneDriver<TScene>,
    ) {
        for (const route of routes) {
            if (this.routes.has(route.id)) {
                throw new Error(`Duplicate scene route '${route.id}'.`);
            }
            this.routes.set(route.id, route);
        }
    }

    get currentRoute(): string | undefined {
        return this.currentRouteId;
    }

    async open(routeId: string, params?: unknown): Promise<TScene> {
        const route = this.routes.get(routeId);
        if (!route) {
            throw new Error(`Unknown scene route '${routeId}'.`);
        }
        const version = ++this.navigationVersion;
        const scene = await this.driver.open(route.url, params);
        if (version !== this.navigationVersion) {
            this.driver.close(scene);
            throw new StaleSceneNavigationError(routeId);
        }

        if (this.currentScene && this.currentScene !== scene) {
            this.driver.close(this.currentScene);
        }
        this.currentScene = scene;
        this.currentRouteId = routeId;
        return scene;
    }

    close(): void {
        this.navigationVersion += 1;
        if (this.currentScene) {
            this.driver.close(this.currentScene);
        }
        this.currentScene = undefined;
        this.currentRouteId = undefined;
    }
}
