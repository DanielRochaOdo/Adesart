from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
ANDROID = ROOT / "android-app"

errors: list[str] = []

if not ANDROID.is_dir():
    errors.append("android-app/ não existe no repositório canônico.")

for forbidden in [
    ANDROID / "supabase",
    ANDROID / "src",
]:
    if forbidden.exists():
        errors.append(f"Backend/Web duplicado encontrado dentro do Android: {forbidden.relative_to(ROOT)}")

main_kotlin = ANDROID / "app" / "src" / "main" / "java"
for path in main_kotlin.rglob("*.kt"):
    text = path.read_text(encoding="utf-8")
    if "dependenteAtivoRegex" in text:
        errors.append(f"Regra Mobile proibida dependenteAtivoRegex em {path.relative_to(ROOT)}")
    if "CadastroErpError.DependenteAtivo" in text:
        errors.append(f"Inferência local de dependente ativo em {path.relative_to(ROOT)}")

status_rules = (
    ANDROID
    / "app/src/main/java/br/com/vendamais/mobile/domain/cadastro/CadastroStatusRules.kt"
)
if status_rules.exists():
    text = status_rules.read_text(encoding="utf-8")
    for status in ("incompleto", "adesoes_pendentes"):
        if f'"{status}"' not in text:
            errors.append(f"Android não contém o status pendente canônico: {status}")
else:
    errors.append("CadastroStatusRules.kt não encontrado.")

web_hook = ROOT / "src/hooks/useCadastros.ts"
if web_hook.exists():
    text = web_hook.read_text(encoding="utf-8")
    for status in ("incompleto", "adesoes_pendentes"):
        if f"'{status}'" not in text and f'"{status}"' not in text:
            errors.append(f"Web não contém o status pendente canônico: {status}")

endpoint_pattern = re.compile(r"functions/v1/([A-Za-z0-9_-]+)")
android_endpoints: set[str] = set()
for path in main_kotlin.rglob("*.kt"):
    text = path.read_text(encoding="utf-8")
    android_endpoints.update(endpoint_pattern.findall(text))

functions_root = ROOT / "supabase/functions"
available_functions = {
    path.name
    for path in functions_root.iterdir()
    if path.is_dir() and not path.name.startswith("_")
}
missing = sorted(android_endpoints - available_functions)
if missing:
    errors.append(
        "Android referencia Edge Functions ausentes do backend canônico: "
        + ", ".join(missing)
    )

if errors:
    print("Falha na paridade Web/Android:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Paridade estrutural Web/Android validada.")
print(f"Endpoints Android validados: {len(android_endpoints)}")
