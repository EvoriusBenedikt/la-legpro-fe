import os
import glob
import re

frontend_dir = r"c:\Users\ben\Documents\Programming\Lintasarta\self-dev\la-legpro\la-legpro-fe\src"
files = glob.glob(os.path.join(frontend_dir, "**", "*.tsx"), recursive=True)
files.extend(glob.glob(os.path.join(frontend_dir, "**", "*.ts"), recursive=True))

fallback_url = "https://legal-analyzer.lintasarta.dev"
dynamic_var = f"(import.meta.env.VITE_API_URL || '{fallback_url}')"
template_var = f"${{import.meta.env.VITE_API_URL || '{fallback_url}'}}"

count = 0
for filepath in files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    if "localhost:8000" not in content:
        continue

    # Replace backticks
    new_content = content.replace("`http://localhost:8000", f"`{template_var}")
    
    # Replace single quotes
    new_content = new_content.replace("'http://localhost:8000", f"{dynamic_var} + '")
    
    # Replace double quotes
    new_content = new_content.replace('"http://localhost:8000', f'{dynamic_var} + "')

    if content != new_content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        count += 1
        print(f"Updated {os.path.relpath(filepath, frontend_dir)}")

print(f"Total files updated: {count}")
