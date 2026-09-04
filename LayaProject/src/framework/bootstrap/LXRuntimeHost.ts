import type { ApplicationRuntime } from "./createRuntime";

let attachedRuntime: ApplicationRuntime | undefined;

/** @internal 仅供 framework bootstrap 绑定运行时。 */
export function bindLXRuntime(runtime: ApplicationRuntime): void {
    if (attachedRuntime && attachedRuntime !== runtime) {
        throw new Error("LX already has an attached runtime.");
    }
    attachedRuntime = runtime;
}

/** @internal 仅供 framework bootstrap 解绑运行时。 */
export function unbindLXRuntime(runtime: ApplicationRuntime): void {
    if (attachedRuntime === runtime) {
        attachedRuntime = undefined;
    }
}

/** @internal 供公共只读门面查询运行时。 */
export function getLXRuntime(): ApplicationRuntime | undefined {
    return attachedRuntime;
}

/** @internal 供公共只读门面取得已绑定运行时。 */
export function requireLXRuntime(): ApplicationRuntime {
    if (!attachedRuntime) {
        throw new Error("LX runtime is not attached.");
    }
    return attachedRuntime;
}
