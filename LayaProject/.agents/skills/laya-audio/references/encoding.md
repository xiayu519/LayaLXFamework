# LayaAir 音频编码规格

- BGM 放在 `audio/bgm/`，默认使用 `.mp3`，44.1 kHz、96 kbps 起测，最长音轨可降到 64–96 kbps；不高于策略上限 128 kbps。
- 高频短音效放在 `audio/sfx/`，默认使用 16-bit PCM `.wav`、44.1 kHz；能接受启动延迟且已完成目标平台兼容验证时可用 `.mp3`。单声道素材优先导出 mono。
- 语音放在 `audio/voice/`，默认 `.mp3`，按听感选择 64–96 kbps；不要用无损母版作为运行时资源。
- `.aiff/.flac` 等母版留在 `Design/` 或音频源仓。运行时文件名稳定，循环点、响度、静音尾部和爆音需在代表性设备验证。
- LayaAir Web、小游戏和 Native 的解码能力不完全等价；格式门禁只证明文件头与项目规格，不能替代真机首播、切后台恢复和内存测试。

参考：[LayaAir 音频播放](https://layaair.com/3.x/doc/basics/common/device/media/readme.html)。
