$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$skillRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = [IO.Path]::GetFullPath((Join-Path $skillRoot "..\..\.."))
$casesPath = Join-Path $skillRoot "evals\cases.json"
$schemaPath = Join-Path $skillRoot "evals\routing-output.schema.json"
$cases = (Get-Content -LiteralPath $casesPath -Raw -Encoding utf8 | ConvertFrom-Json).cases
$requests = @($cases | ForEach-Object { [ordered]@{ id = $_.id; request = $_.request } }) | ConvertTo-Json -Depth 4 -Compress
$minimumCliVersion = [Version]"0.153.2"
$installedVersionText = (& codex --version 2>$null) -join ""
$installedVersionMatch = [regex]::Match($installedVersionText, "(\d+\.\d+\.\d+)")
$installedVersion = if ($installedVersionMatch.Success) { [Version]$installedVersionMatch.Groups[1].Value } else { [Version]"0.0.0" }
$usePinnedCli = $installedVersion -lt $minimumCliVersion

$prompt = @"
这是 LXFamework 项目 Skill 的语义路由评测。不要调用工具，不要打开 SKILL.md，不要执行或分析任务本身；仅依据本次 Codex 启动时已提供的项目 Skill 名称与 description 分类。

对每个 case 返回完成请求所需的最小项目 Skill 集合。只有语义确实跨越独立边界才返回多个；不要返回系统 Skill、相邻但不需要的 Skill 或解释。保留 case id。

cases: $requests
"@

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ("lx-skill-routing-" + [Guid]::NewGuid().ToString("N"))))
if (-not $tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe temp path: $tempRoot"
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$resultPath = Join-Path $tempRoot "last-message.json"

try {
    Push-Location $projectRoot
    try {
        $execArguments = @(
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--skip-git-repo-check",
            "--sandbox", "read-only",
            "--disable", "plugins",
            "--disable", "apps",
            "--model", "gpt-5.6-sol",
            "-c", 'model_reasoning_effort="high"',
            "--json",
            "--output-schema", $schemaPath,
            "--output-last-message", $resultPath,
            "-"
        )
        if ($usePinnedCli) {
            Write-Output "Installed Codex CLI $installedVersion is too old; using pinned @openai/codex@$minimumCliVersion for this eval."
            $events = @($prompt | & npx --yes --package "@openai/codex@$minimumCliVersion" codex @execArguments)
        }
        else {
            $events = @($prompt | & codex @execArguments)
        }
        if ($LASTEXITCODE -ne 0) {
            if ($events.Count -gt 0) {
                Write-Output ($events -join "`n")
            }
            throw "codex exec failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $actual = Get-Content -LiteralPath $resultPath -Raw -Encoding utf8 | ConvertFrom-Json
    $actualById = @{}
    foreach ($result in $actual.results) {
        if ($actualById.ContainsKey($result.id)) {
            throw "Duplicate routing result id: $($result.id)"
        }
        $actualById[$result.id] = @($result.skills | Sort-Object)
    }

    $failures = @()
    foreach ($case in $cases) {
        $expected = @($case.expected | Sort-Object)
        if (-not $actualById.ContainsKey($case.id)) {
            $failures += "$($case.id): missing result"
            continue
        }
        $observed = @($actualById[$case.id])
        if (Compare-Object -ReferenceObject $expected -DifferenceObject $observed) {
            $failures += "$($case.id): expected [$($expected -join ', ')], got [$($observed -join ', ')]"
        }
    }
    foreach ($id in $actualById.Keys) {
        if ($id -notin $cases.id) {
            $failures += "$id`: unexpected result"
        }
    }

    if ($failures.Count -gt 0) {
        Write-Error ("Skill routing eval failed:`n- " + ($failures -join "`n- "))
    }

    $usage = $null
    foreach ($line in $events) {
        try {
            $event = $line | ConvertFrom-Json
            if ($event.type -eq "turn.completed") {
                $usage = $event.usage
            }
        }
        catch {
            # stderr/progress lines are intentionally ignored; the final message is schema-validated.
        }
    }
    $usageText = if ($usage) { " Usage: $($usage | ConvertTo-Json -Compress)." } else { "" }
    Write-Output "Skill routing OK: $($cases.Count) semantic cases, one ephemeral read-only Codex run.$usageText"
}
finally {
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    if ($resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
