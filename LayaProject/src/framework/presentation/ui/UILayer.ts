export enum UILayer {
    Background = 0,
    Screen = 1,
    HUD = 2,
    Popup = 3,
    Guide = 4,
    Toast = 5,
    System = 6,
}

export const UI_LAYER_NAMES: Readonly<Record<UILayer, string>> = Object.freeze({
    [UILayer.Background]: "background",
    [UILayer.Screen]: "screen",
    [UILayer.HUD]: "hud",
    [UILayer.Popup]: "popup",
    [UILayer.Guide]: "guide",
    [UILayer.Toast]: "toast",
    [UILayer.System]: "system",
});
