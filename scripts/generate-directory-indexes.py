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
    <title>Claude KVM &mdash; Test Artifacts &mdash; {html.escape(title_text)}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: "SF Mono", "Fira Code", Consolas, monospace;
            background: #0a0a0a;
            min-height: 100vh;
            color: #e5e5e5;
        }}

        .bar {{
            background: #0d0d0d;
            border-bottom: 1px solid #222;
            padding: 12px clamp(12px, 3vw, 20px);
            font-size: clamp(11px, 2.5vw, 13px);
            color: #737373;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            min-height: 44px;
        }}

        .bar a {{ color: #d4845a; text-decoration: none; }}
        .bar a:hover {{ opacity: .7; }}
        .bar .sep {{ color: #333; margin: 0 1px; }}

        .content {{
            max-width: 960px;
            margin: 0 auto;
            padding: clamp(12px, 3vw, 24px);
        }}

        .stats {{
            background: #111;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 12px;
            border: 1px solid #222;
            font-size: clamp(11px, 2.5vw, 13px);
            color: #737373;
        }}

        /* --- Table (desktop) --- */
        .listing {{
            border: 1px solid #222;
            border-radius: 8px;
            overflow: hidden;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
        }}

        thead {{
            border-bottom: 1px solid #222;
        }}

        th {{
            text-align: left;
            padding: 10px 14px;
            font-weight: 500;
            color: #d4845a;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: #0d0d0d;
        }}

        td {{
            padding: 8px 14px;
            border-bottom: 1px solid #1a1a1a;
            font-size: 13px;
        }}

        tr:last-child td {{
            border-bottom: none;
        }}

        tr:hover td {{
            background: rgba(212, 132, 90, 0.04);
        }}

        .icon {{
            display: inline-block;
            width: 18px;
            margin-right: 6px;
            text-align: center;
            font-style: normal;
        }}

        a {{ color: #e5e5e5; text-decoration: none; }}
        a:hover {{ color: #d4845a; }}

        .size, .date {{ color: #737373; font-size: 12px; white-space: nowrap; }}

        .empty {{
            text-align: center;
            padding: 40px;
            color: #737373;
        }}

        .footer {{
            max-width: 960px;
            margin: 24px auto 0;
            padding: 0 clamp(12px, 3vw, 24px) 24px;
            text-align: center;
            font-size: 12px;
            color: #737373;
        }}

        .footer a {{ color: #d4845a; text-decoration: none; }}

        /* --- Mobile: hide table, show cards --- */
        .cards {{ display: none; }}

        @media (max-width: 600px) {{
            table {{ display: none; }}
            .cards {{ display: block; }}

            .card {{
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 14px;
                border-bottom: 1px solid #1a1a1a;
                font-size: 13px;
            }}

            .card:last-child {{ border-bottom: none; }}
            .card:active {{ background: rgba(212, 132, 90, 0.04); }}

            .card .icon {{ flex-shrink: 0; font-size: 16px; }}

            .card-info {{
                flex: 1;
                min-width: 0;
            }}

            .card-name {{
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }}

            .card-name a {{ color: #e5e5e5; }}
            .card-name a:hover {{ color: #d4845a; }}

            .card-meta {{
                font-size: 11px;
                color: #737373;
                margin-top: 2px;
            }}
        }}
    </style>
</head>
<body>
    <div class="bar">
        <a href="/">Claude KVM</a>
        {''.join(f'<span class="sep">/</span><a href="{path}">{html.escape(name)}</a>' for name, path in breadcrumb_parts)}
    </div>

    <div class="content">
        <div class="stats">
            {sum(1 for i in items if i['is_dir'])} directories,
            {sum(1 for i in items if not i['is_dir'])} files
        </div>

        {generate_listing(items) if items else '<div class="empty">No files or directories found</div>'}
    </div>

    <div class="footer">
        <a href="https://www.claude-kvm.ai">claude-kvm.ai</a>
        &mdash; &copy; 2026 R&#305;za Emre ARAS
    </div>
</body>
</html>"""

    return html_content


def generate_listing(items):
    """Generate table + mobile cards for file listing"""
    sorted_items = sorted(items, key=lambda x: (not x['is_dir'], x['name'].lower()))

    table_rows = []
    card_rows = []

    for item in sorted_items:
        icon = get_icon(item)
        name = html.escape(item['name'])
        link = f"{item['name']}/index.html" if item['is_dir'] else item['name']
        label = f"{name}/" if item['is_dir'] else name
        size = format_size(item['size']) if item['size'] else '&mdash;'
        date = item['modified'].strftime('%Y-%m-%d %H:%M')

        table_rows.append(
            f'<tr>'
            f'<td><span class="icon">{icon}</span><a href="{link}">{label}</a></td>'
            f'<td class="size">{size}</td>'
            f'<td class="date">{date}</td>'
            f'</tr>'
        )

        card_rows.append(
            f'<div class="card">'
            f'<span class="icon">{icon}</span>'
            f'<div class="card-info">'
            f'<div class="card-name"><a href="{link}">{label}</a></div>'
            f'<div class="card-meta">{size} &middot; {date}</div>'
            f'</div>'
            f'</div>'
        )

    table = (
        f'<div class="listing">'
        f'<table><thead><tr>'
        f'<th>Name</th><th>Size</th><th>Modified</th>'
        f'</tr></thead><tbody>'
        f"{''.join(table_rows)}"
        f'</tbody></table>'
        f'<div class="cards">{"".join(card_rows)}</div>'
        f'</div>'
    )

    return table


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