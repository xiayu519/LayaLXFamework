export enum UILayer {
    Background = 0,
    Screen = 1,
    HUD = 2,
    Popup = 3,
    Guide = 4,
    Toast = 5,
    System = 6,
}

/** 每个宿主使用独立且有界的排序区间；数值是同级节点的原生 zOrder，不是全局场景深度。 */
export const UI_LAYER_CAPACITY = 1000;

export const UI_LAYER_NAMES: Readonly<Record<UILayer, string>> = Object.freeze({
    [UILayer.Background]: "background",
    [UILayer.Screen]: "screen",
    [UILayer.HUD]: "hud",
    [UILayer.Popup]: "popup",
    [UILayer.Guide]: "guide",
    [UILayer.Toast]: "toast",
    [UILayer.System]: "system",
});
