from pathlib import Path
import json
import os
import re
import subprocess
import sys


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = PROJECT_ROOT / ".agents" / "skills"
VALIDATOR = Path.home() / ".codex" / "skills" / ".system" / "skill-creator" / "scripts" / "quick_validate.py"
AGENTS = PROJECT_ROOT / "AGENTS.md"
ROUTING_CASES = SKILLS_ROOT / "codex-workflow" / "evals" / "cases.json"
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
EXPLICIT_SKILL = re.compile(r"\$[a-z][a-z0-9-]*")


def field(frontmatter: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", frontmatter, re.MULTILINE)
    return match.group(1).strip().strip('"\'') if match else ""


def local_markdown_links_resolve(markdown: Path) -> list[str]:
    errors = []
    source = markdown.read_text(encoding="utf-8")
    for target in MARKDOWN_LINK.findall(source):
        if "://" in target or target.startswith("#"):
            continue
        resolved = (markdown.parent / target.split("#", 1)[0]).resolve()
        if not resolved.exists():
            errors.append(f"{markdown.relative_to(PROJECT_ROOT)}: missing link target '{target}'")
    return errors


def main() -> int:
    errors = []
    uses_system_validator = VALIDATOR.is_file()

    skills = sorted(path.parent for path in SKILLS_ROOT.glob("*/SKILL.md"))
    if not skills:
        errors.append("No project skills discovered under .agents/skills.")

    descriptions = []
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    for skill in skills:
        if uses_system_validator:
            result = subprocess.run(
                [sys.executable, str(VALIDATOR), str(skill)],
                check=False,
                env=environment,
            )
            if result.returncode != 0:
                errors.append(f"quick_validate failed: {skill.name}")
                continue

        skill_file = skill / "SKILL.md"
        source = skill_file.read_text(encoding="utf-8")
        match = FRONTMATTER.match(source)
        if not match:
            errors.append(f"{skill.name}: missing YAML frontmatter")
            continue
        name = field(match.group(1), "name")
        description = field(match.group(1), "description")
        unknown_fields = sorted(
            line.split(":", 1)[0].strip()
            for line in match.group(1).splitlines()
            if ":" in line and line.split(":", 1)[0].strip() not in {"name", "description"}
        )
        if name != skill.name:
            errors.append(f"{skill.name}: frontmatter name must match directory")
        if not re.fullmatch(r"[a-z][a-z0-9-]*", name):
            errors.append(f"{skill.name}: invalid skill name")
        if not description:
            errors.append(f"{skill.name}: description is required")
        if len(description) > 240:
            errors.append(f"{skill.name}: description exceeds 240 characters")
        if unknown_fields:
            errors.append(f"{skill.name}: unsupported frontmatter fields {unknown_fields}")
        descriptions.append(description)

        openai_yaml = skill / "agents" / "openai.yaml"
        if not openai_yaml.is_file():
            errors.append(f"{skill.name}: agents/openai.yaml is required")
        else:
            yaml_source = openai_yaml.read_text(encoding="utf-8")
            if "allow_implicit_invocation: true" not in yaml_source:
                errors.append(f"{skill.name}: implicit invocation must be enabled")
            if "default_prompt:" in yaml_source:
                errors.append(f"{skill.name}: default_prompt is omitted to keep routing semantic")

        for markdown in skill.rglob("*.md"):
            errors.extend(local_markdown_links_resolve(markdown))

    if len(set(skill.name for skill in skills)) != len(skills):
        errors.append("Project skill names must be unique.")
    if sum(len(description) for description in descriptions) > 2500:
        errors.append("Combined project skill descriptions exceed the 2500-character budget.")

    agents_source = AGENTS.read_text(encoding="utf-8")
    if len(agents_source.encode("utf-8")) > 2048:
        errors.append("AGENTS.md exceeds the 2048-byte project budget.")
    if EXPLICIT_SKILL.search(agents_source):
        errors.append("AGENTS.md must not hard-code explicit $skill routing.")

    try:
        cases = json.loads(ROUTING_CASES.read_text(encoding="utf-8"))["cases"]
        covered = {name for case in cases for name in case["expected"]}
        discovered = {skill.name for skill in skills}
        if covered != discovered:
            missing = sorted(discovered - covered)
            unknown = sorted(covered - discovered)
            errors.append(f"Routing eval coverage mismatch; missing={missing}, unknown={unknown}")
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        errors.append(f"Cannot validate routing cases: {error}")

    if errors:
        print("Skill validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Skills OK: {len(skills)} discovered dynamically; "
        f"description budget {sum(len(item) for item in descriptions)}/2500 characters; "
        f"validator={'system+project' if uses_system_validator else 'project-portable'}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
