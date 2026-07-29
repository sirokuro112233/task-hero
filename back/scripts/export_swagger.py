"""FastAPIのOpenAPIスキーマと静的Swagger UIを書き出す。"""

import argparse
import json
import sys
from pathlib import Path

from fastapi.openapi.docs import get_swagger_ui_html


BACK_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACK_DIR / "app"))

from main import app  # noqa: E402


def export_swagger(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    schema = app.openapi()
    (output_dir / "openapi.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # 相対URLにすることで、GitHub Pagesのリポジトリ配下でも参照できる。
    swagger_html = get_swagger_ui_html(
        openapi_url="./openapi.json",
        title=f"{app.title} - Swagger UI",
    )
    (output_dir / "index.html").write_bytes(swagger_html.body)
    (output_dir / ".nojekyll").touch()

    print(f"Swagger UI exported to {output_dir.resolve()}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=BACK_DIR / "site",
        help="出力先ディレクトリ (default: back/site)",
    )
    args = parser.parse_args()
    export_swagger(args.output)


if __name__ == "__main__":
    main()
