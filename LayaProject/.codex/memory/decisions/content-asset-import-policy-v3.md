---
type: decision
scope: content-assets
description: Spine 3.8 JSON 在合法 Spine 目录按内容、版本与关联资源自动校验，不再使用逐文件例外。
trigger: 新增或修改 Spine 3.8.x JSON、atlas、页纹理或其资源目录时
status: active
last_verified: 2026-09-07
source: user-confirmed
---

# Content asset import policy v3

## Context

Spine JSON 是 LayaAir 正式支持的主文件格式。生产资源普遍使用 JSON 时，将每个路径登记为例外既重复又不能证明内容确实是兼容的 Spine 数据；固定到 `bootstrap/game` 又会漏掉功能包和共享包。

## Decision

`AssetImportPolicy` v2 移除 `exceptions.jsonSpine`。内容门禁复用 `ResourceLayout`，对 `bootstrap/<scope>/spine/<name>`、`packages/<feature>/spine/<name>` 和 `shared/<domain>/spine/<name>` 中的 JSON 自动读取 `skeleton.spine`，要求其 `major.minor` 匹配项目 Spine 3.8 运行时，并要求存在骨骼数据、同名 atlas、atlas 引用的全部页纹理和正确 `.meta`。其他资源类型目录的 JSON 仍按普通数据处理。

代码动态加载 Spine JSON 时仍显式使用 `Laya.Loader.SPINE`；资产目录只决定门禁语义，不改变 Laya Loader 对通用 `.json` 扩展名的识别方式。

## Consequences

合法的 Spine Editor 3.8.x JSON（包括 3.8.87）无需维护路径白名单；错误版本、缺少版本信息、伪 Spine JSON、错名 atlas 和缺页纹理会在进入运行时前失败。`.skel` 仍受包结构和运行时基线约束，但其二进制导出版本无法通过 JSON 字段检查。

## Re-evaluate when

项目切换 Spine 运行时、LayaAir 改变 atlas 解析规则，或需要允许第三方生成但缺少 `skeleton.spine` 的 JSON 时，重新评估识别与失败策略，不以通配例外绕过门禁。
