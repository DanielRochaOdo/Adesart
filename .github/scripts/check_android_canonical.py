from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
android = root / "android-app"
errors = []

if not android.exists():
    errors.append("android-app/ ausente do repositorio canonico")

for relative in ("supabase", "migrations", "functions"):
    path = android / relative
    if path.exists():
        errors.append(f"{path.relative_to(root)} nao pode existir; backend fica somente em supabase/")

mapper = android / "app/src/main/java/br/com/vendamais/mobile/domain/cadastro/CadastroApiErrorMapper.kt"
if mapper.exists():
    text = mapper.read_text(encoding="utf-8")
    if "dependenteAtivoRegex" in text:
        errors.append("Android voltou a inferir DependenteAtivo por regex textual")

for path in android.rglob("*.sql"):
    errors.append(f"{path.relative_to(root)} nao pode conter regra SQL de servidor")

if errors:
    print("Falha na arquitetura canonica:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Arquitetura canonica Web/Android validada.")
