"""
Generate Directory Index HTML files for Claude KVM Test Artifacts
Creates clean, navigable directory listings for CI test results

Copyright (c) 2026 Riza Emre ARAS <r.emrearas@proton.me>
Licensed under MIT
"""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime
import html

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)-8s %(message)s'
)


def format_size(size):
    """Format file size in human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"


FILE_ICONS = {
    '.png': '&#x1F5BC;',
    '.jpg': '&#x1F5BC;',
    '.jpeg': '&#x1F5BC;',
    '.gif': '&#x1F5BC;',
    '.svg': '&#x1F5BC;',
    '.mp4': '&#x1F3AC;',
    '.webm': '&#x1F3AC;',
    '.mov': '&#x1F3AC;',
    '.log': '&#x1F4C4;',
    '.txt': '&#x1F4C4;',
    '.json': '&#x1F4C4;',
    '.zip': '&#x1F4E6;',
}


def get_icon(item):
    """Get icon for a file or directory"""
    if item['is_dir']:
        return '&#x1F4C1;'
    ext = Path(item['name']).suffix.lower()
    return FILE_ICONS.get(ext, '&#x1F4C4;')


def create_index_html(directory_path, root_path=None):
    """Create an index.html file for a directory"""

    directory = Path(directory_path)
    if root_path:
        root = Path(root_path)
        relative_path = directory.relative_to(root)
    else:
        relative_path = Path()

    items = []
    for item in sorted(directory.iterdir()):
        if item.name.startswith('.') or item.name == 'index.html':
            continue

        stat = item.stat()

        if item.is_dir():
            items.append({
                'name': item.name,
                'is_dir': True,
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'size': None
            })
        else:
            items.append({
                'name': item.name,
                'is_dir': False,
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'size': stat.st_size
            })

    # Breadcrumb
    breadcrumb_parts = []
    if relative_path != Path():
        current = Path()
        breadcrumb_parts.append(('Test Artifacts', '../' * len(relative_path.parts)))
        for part in relative_path.parts:
            current = current / part
            depth = len(relative_path.parts) - len(current.parts)
            breadcrumb_parts.append((part, '../' * depth if depth > 0 else './'))
    else:
        breadcrumb_parts.append(('Test Artifacts', './'))

    title_text = str(relative_path) if relative_path != Path() else 'Home'

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude KVM — Test Artifacts — {html.escape(title_text)}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: "SF Mono", "Fira Code", "Consolas", monospace;
            background: #0a0a0a;
            min-height: 100vh;
            color: #e5e5e5;
            padding: 20px;
        }}

        .container {{
            max-width: 960px;
            margin: 0 auto;
            background: #111111;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #222222;
        }}

        .header {{
            background: #0d0d0d;
            padding: 24px 30px;
            border-bottom: 1px solid #222222;
        }}

        h1 {{
            font-size: 20px;
            font-weight: 600;
            color: #d4845a;
            margin-bottom: 10px;
        }}

        .breadcrumb {{
            font-size: 13px;
            color: #737373;
        }}

        .breadcrumb a {{
            color: #d4845a;
            text-decoration: none;
        }}

        .breadcrumb a:hover {{
            opacity: 0.7;
        }}

        .breadcrumb .sep {{
            margin: 0 6px;
            color: #333;
        }}

        .content {{
            padding: 20px 30px 30px;
        }}

        .stats {{
            background: #0d0d0d;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            border: 1px solid #222222;
            font-size: 13px;
            color: #737373;
        }}

        .table-wrapper {{
            overflow-x: auto;
            border-radius: 8px;
        }}

        .table-wrapper::-webkit-scrollbar {{
            height: 6px;
        }}

        .table-wrapper::-webkit-scrollbar-thumb {{
            background: #333;
            border-radius: 3px;
        }}

        table {{
            width: 100%;
            min-width: 480px;
            border-collapse: collapse;
        }}

        thead {{
            border-bottom: 1px solid #222222;
        }}

        th {{
            text-align: left;
            padding: 10px 12px;
            font-weight: 500;
            color: #d4845a;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}

        td {{
            padding: 8px 12px;
            border-bottom: 1px solid #1a1a1a;
            font-size: 13px;
        }}

        tr:hover {{
            background: rgba(212, 132, 90, 0.04);
        }}

        .icon {{
            display: inline-block;
            width: 20px;
            margin-right: 6px;
            text-align: center;
            font-style: normal;
        }}

        a {{
            color: #e5e5e5;
            text-decoration: none;
        }}

        a:hover {{
            color: #d4845a;
        }}

        .size, .date {{
            color: #737373;
            font-size: 12px;
        }}

        .empty {{
            text-align: center;
            padding: 40px;
            color: #737373;
        }}

        .footer {{
            background: #0d0d0d;
            padding: 16px 30px;
            border-top: 1px solid #222222;
            text-align: center;
            font-size: 12px;
            color: #737373;
        }}

        .footer a {{
            color: #d4845a;
        }}

        @media (max-width: 640px) {{
            body {{ padding: 0; }}
            .container {{ border-radius: 0; border-left: 0; border-right: 0; }}
            .header, .content {{ padding: 16px; }}
            h1 {{ font-size: 17px; }}
            .size-col {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Claude KVM &mdash; Test Artifacts</h1>
            <div class="breadcrumb">
                {'<span class="sep">/</span>'.join(f'<a href="{path}">{html.escape(name)}</a>' for name, path in breadcrumb_parts)}
            </div>
        </div>

        <div class="content">
            <div class="stats">
                {sum(1 for i in items if i['is_dir'])} directories,
                {sum(1 for i in items if not i['is_dir'])} files
            </div>

            {generate_table(items) if items else '<div class="empty">No files or directories found</div>'}
        </div>

        <div class="footer">
            <a href="https://www.claude-kvm.ai">claude-kvm.ai</a>
            &mdash; &copy; 2026 R&#305;za Emre ARAS
        </div>
    </div>
</body>
</html>"""

    return html_content


def generate_table(items):
    """Generate the file listing table"""
    rows = []
    sorted_items = sorted(items, key=lambda x: (not x['is_dir'], x['name'].lower()))

    for item in sorted_items:
        icon = get_icon(item)

        if item['is_dir']:
            link = f"{item['name']}/index.html"
            name_display = f'<a href="{link}">{html.escape(item["name"])}/</a>'
        else:
            link = item['name']
            name_display = f'<a href="{link}">{html.escape(item["name"])}</a>'

        size_display = f'<td class="size size-col">{format_size(item["size"])}</td>' if item[
            'size'] else '<td class="size size-col">&mdash;</td>'
        date_display = f'<td class="date">{item["modified"].strftime("%Y-%m-%d %H:%M")}</td>'

        rows.append(f"""
            <tr>
                <td><span class="icon">{icon}</span>{name_display}</td>
                {size_display}
                {date_display}
            </tr>""")

    return f"""
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th class="size-col">Size</th>
                        <th>Modified</th>
                    </tr>
                </thead>
                <tbody>{''.join(rows)}
                </tbody>
            </table>
        </div>"""


def process_directory_tree(root_dir):
    """Process entire directory tree and create index files"""
    root = Path(root_dir)

    if not root.exists():
        logging.error(f"Directory {root} does not exist")
        return False

    processed = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith('.')]

        current_dir = Path(dirpath)
        html_content = create_index_html(current_dir, root)
        index_path = current_dir / "index.html"

        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        logging.info(f"Created: {index_path.relative_to(root.parent)}")
        processed += 1

    logging.info(f"Created {processed} index files")
    return True


def main():
    if len(sys.argv) < 2:
        logging.error("Usage: python generate-directory-indexes.py <directory>")
        sys.exit(1)

    target_dir = sys.argv[1]
    logging.info(f"Generating directory indexes for: {target_dir}")
    success = process_directory_tree(target_dir)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
