---
type: problem
scope: runtime-lifecycle
description: clean unbind 若仍由模块级隔离集合强引用，旧 runtime 对象图会一直存活到下一次 bind；完成清理后必须主动解除引用。
trigger: 修改 LX runtime 绑定、停机隔离、晚到清理或检查旧 runtime 的内存可达性时。
status: active
last_verified: 2026-09-05
source: code-verified
---

# Runtime quarantine reference release

## Reproduction

`unbindLXRuntime` 把已退役 runtime 放入模块级 `Set`；正常 clean unbind 也保留该强引用，且原实现只在下一次 `bindLXRuntime` 时检查和删除。应用不再启动新 runtime 时，旧 runtime 与其 service 对象图持续可达。

## Root cause

隔离集合同时承担“阻止新 runtime 越过未完成清理”和“保存诊断对象”两项职责，却没有在清理完成时主动释放元素。

## Fix or avoidance

clean unbind 立即返回，不进入隔离集合。确有晚到清理时只临时隔离，并用短周期、`unref` 的重检观察 `settling` 状态；一旦 snapshot 证明清理完整，清除 timer、置空 runtime 引用并从集合删除。无法证明清理完成的状态继续 fail closed。

## Verification

`tests/framework/LX.test.ts` 覆盖 clean 停机、未完成清理阻止替换，以及“晚到清理完成且没有再次 bind”时仍会主动释放隔离引用。
