import type { PlatformService } from "./PlatformService";
import { WebPlatformService } from "./WebPlatformService";
import { WeChatMiniGamePlatformService } from "./WeChatMiniGamePlatformService";

export function createDefaultPlatformService(): PlatformService {
    return WeChatMiniGamePlatformService.isSupported()
        ? new WeChatMiniGamePlatformService()
        : new WebPlatformService();
}
