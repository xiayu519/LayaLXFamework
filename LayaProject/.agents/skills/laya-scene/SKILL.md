---
name: laya-scene
description: 实现或修复 SceneRouter、Laya Scene 加载/打开/关闭、场景切换竞态、导航版本和场景级资源边界时使用；ui2 窗口路由不触发。
---

# Laya Scene

1. 检查 `SceneRouter`、`LayaSceneDriver`、startup scene 及相关资源 group。
2. 应用层只表达导航意图；Laya Scene API 调用保留在 infrastructure 实现。
3. 每次导航递增版本，只允许最新请求提交；旧加载完成后不得覆盖当前场景。
4. 切换顺序必须明确旧场景停止、显示对象销毁、资源释放与新场景激活的边界。
5. 为连续导航、加载失败和回退补测试；修改场景资产后运行 `npm run validate:assets` 和 `npm run test:headless`。
