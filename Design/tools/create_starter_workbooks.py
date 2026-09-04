from pathlib import Path

from openpyxl import Workbook


CONFIG_ROOT = Path(__file__).resolve().parent.parent / "config"


def write_workbook(name: str, rows: list[list[object]]) -> None:
    path = CONFIG_ROOT / name
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def main() -> None:
    CONFIG_ROOT.mkdir(parents=True, exist_ok=True)
    write_workbook("__tables__.xlsx", [
        ["##var", "full_name", "value_type", "read_schema_from_file", "input", "index", "mode", "group", "comment", "tags", "output"],
        ["##", "full name", "record type", "read schema from source", "input files", "index field", "one|map|list", "c", "comment", "tags", "output name"],
    ])
    write_workbook("__beans__.xlsx", [
        ["##var", "full_name", "parent", "valueType", "sep", "alias", "comment", "group", "tags", "*fields", None, None],
        ["##var", None, None, None, None, None, None, None, None, "name", "type", "group"],
        ["##", "full name", "parent", "value type", "separator", "alias", "comment", "group", "tags", "field", "type", "group"],
    ])
    write_workbook("__enums__.xlsx", [
        ["##var", "full_name", "flags", "unique", "group", "comment", "tags", "*items", None, None, None, None],
        ["##var", None, None, None, None, None, None, "name", "alias", "value", "comment", "tags"],
        ["##", "full name", "flags", "unique", "group", "comment", "tags", "item", "alias", "value", "comment", "tags"],
    ])
    write_workbook("#TableAppConfig.xlsx", [
        ["##var", "id", "name", "value"],
        ["##type", "int", "string", "string"],
        ["##", "ID", "配置名", "配置值"],
        [None, 1, "framework_name", "LXFamework"],
    ])


if __name__ == "__main__":
    main()
