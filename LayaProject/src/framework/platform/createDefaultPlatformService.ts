import type { PlatformService } from "./PlatformService";
import { WebPlatformService } from "./WebPlatformService";
import { WeChatMiniGamePlatformService } from "./WeChatMiniGamePlatformService";

export function createDefaultPlatformService(): PlatformService {
    const browser = Laya.Browser;
    if (Laya.LayaEnv?.isConch || browser?.onLayaRuntime) {
        throw new Error("Native platform requires ApplicationConfig.platform.");
    }
    if (WeChatMiniGamePlatformService.isSupported()
        && (!browser?.onMiniGame || browser.onWXMiniGame)) {
        return new WeChatMiniGamePlatformService();
    }
    if (browser?.onMiniGame || browser?.onWXMiniGame) {
        throw new Error("Unsupported mini-game platform; provide ApplicationConfig.platform.");
    }
    return new WebPlatformService();
}
