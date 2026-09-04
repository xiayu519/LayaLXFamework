---
name: laya-audio
description: 设置音频源格式/编码，或实现诊断 Laya SoundManager、AudioService、BGM、SFX、静音、音量、owner 停止和前后台恢复时使用；普通 Loader 与 IAP 不触发。
---

# Laya Audio

1. 涉及音频源格式或编码时先读 [encoding.md](references/encoding.md)；运行时底层直接使用 `Laya.SoundManager`，`AudioService` 只提供 BGM/SFX、幂等 handle、owner 批量停止和用户设置。
2. 明确 loops：BGM 默认持续循环，SFX 默认一次；完成回调、手动停止、替换 BGM 与 dispose 必须收敛到同一幂等状态。
3. `SoundManager` 使用独立 `AudioDataCache`，不得用普通 Loader group lease 声称拥有或释放解码音频。
4. 前后台恢复必须区分用户静音、平台失焦与待恢复 BGM；没有实际需求时不预建策略。
5. 修改资产运行 `npm run validate:content-assets`；补状态单测。真实格式解码、焦点恢复与设备内存必须用代表性音频资产做专项 Headless/真机验证。
