---
name: laya-audio
description: 实现或诊断 Laya SoundManager、AudioService、背景音乐、音效、静音、音量、焦点恢复和音频资源释放时使用；平台支付与普通资源加载不触发。
---

# Laya Audio

1. 以 `engine/types/LayaAir.d.ts`、`AudioService` 和 Laya `SoundManager` 的真实行为为准。
2. 业务从 `LX.Audio` 发出播放意图；服务保存业务需要的音量和静音状态，不复制 Laya 的声道系统。
3. BGM 切换、重复播放、前后台恢复和用户静音必须幂等；Web 自动播放限制应保留为可观察失败或待用户手势状态。
4. 每次播放返回可幂等停止的 handle；用 owner 批量停止功能音效。停止声道后释放对应 group lease，最后一个使用者退出后才清资源。
5. 为状态转换补单元测试；需要证明真实播放初始化时运行 `npm run test:headless` 并检查 console/runtime 错误。
