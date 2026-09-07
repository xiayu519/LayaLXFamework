import type { BaseGameWindow } from "./BaseGameWindow";
import { UILayer } from "./UILayer";
import type { UIRoute, UIWindowInfo } from "./UIRouter";
import type { CleanupWindowRecord } from "./UIWindowCleanup";
import { getWindowCleanupDiagnostic } from "./UIWindowCleanup";
import type { UIWindowLayout } from "./UILayoutService";

interface UIWindowRouteRecord extends CleanupWindowRecord {
    readonly route: UIRoute<unknown>;
    readonly window: BaseGameWindow<unknown>;
}

export function resolveLayer(route: Pick<UIRoute<unknown>, "layer">): UILayer {
    return route.layer ?? UILayer.Screen;
}

export function resolveWindowLayout(
    route: Pick<UIRoute<unknown>, "layer" | "layout">,
): UIWindowLayout {
    return route.layout ?? (resolveLayer(route) === UILayer.Popup ? "center-popup" : "fullscreen");
}

export function toWindowInfo(record: UIWindowRouteRecord): UIWindowInfo {
    return Object.freeze({
        routeId: record.route.id,
        layer: resolveLayer(record.route),
        modal: record.window.modal,
        state: getWindowCleanupDiagnostic(record) ? "cleanup-failed"
            : record.window.isShowing ? "visible" : "hidden-retained",
        window: record.window,
    });
}

export function compareVisibleWindows(left: UIWindowInfo, right: UIWindowInfo): number {
    if (left.layer !== right.layer) return left.layer - right.layer;
    return displayIndex(left.window) - displayIndex(right.window);
}

function displayIndex(window: BaseGameWindow<unknown>): number {
    return window.parent?.getChildIndex(window) ?? -1;
}
