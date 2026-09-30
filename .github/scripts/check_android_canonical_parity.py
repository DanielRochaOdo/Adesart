from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
ANDROID = ROOT / "android-app"

errors: list[str] = []

erp_upload_migration = ROOT / "supabase/migrations/20260930191500_fix_erp_upload_worker_delivery.sql"
if erp_upload_migration.exists():
    migration_text = erp_upload_migration.read_text(encoding="utf-8")
    malformed_lines = [
        line.strip()
        for line in migration_text.splitlines()
        if line.strip() in {"AS $", "$;"}
    ]
    if malformed_lines:
        errors.append(
            "Migration ERP contém delimitador dollar-quote inválido (AS $ / $;)."
        )

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

dashboard_screen = (
    ANDROID
    / "app/src/main/java/br/com/vendamais/mobile/ui/screens/DashboardScreen.kt"
)
dashboard_repository = (
    ANDROID
    / "app/src/main/java/br/com/vendamais/mobile/data/remote/SupabaseRepository.kt"
)
auth_service = (
    ANDROID
    / "app/src/main/java/br/com/vendamais/mobile/data/auth/SupabaseAuthService.kt"
)

if dashboard_screen.exists():
    dashboard_text = dashboard_screen.read_text(encoding="utf-8")
    if "state.cadastros" in dashboard_text:
        errors.append(
            "Dashboard Android voltou a consumir a lista bruta state.cadastros; "
            "use dashboardCadastros da RPC canônica."
        )
    if "state.dashboardCadastros" not in dashboard_text:
        errors.append("Dashboard Android não consome dashboardCadastros canônico.")
else:
    errors.append("DashboardScreen.kt não encontrado.")

if dashboard_repository.exists():
    repository_text = dashboard_repository.read_text(encoding="utf-8")
    if "get_dashboard_cadastros_fast_v1" not in repository_text:
        errors.append(
            "Android não referencia a RPC canônica get_dashboard_cadastros_fast_v1 usada pelo Web."
        )
    if "fetchDashboardCadastrosFallback" not in repository_text:
        errors.append(
            "Dashboard Android voltou a depender exclusivamente da RPC; mantenha o fallback paginado usado pelo Web."
        )
    if 'path = "cadastros"' not in repository_text or '"created_at", "gte.$startIso"' not in repository_text:
        errors.append(
            "Fallback Android do Dashboard não preserva a leitura paginada por intervalo."
        )
else:
    errors.append("SupabaseRepository.kt não encontrado.")

dashboard_company_migration = (
    ROOT
    / "supabase/migrations/20260929203000_dashboard_resolve_empresa_canonica.sql"
)
if dashboard_company_migration.exists():
    company_text = dashboard_company_migration.read_text(encoding="utf-8")
    for required in ("empresa_codigo_resolvido", "empresa_nome_resolvido", "Empresa código"):
        if required not in company_text:
            errors.append(
                f"Resolução canônica de empresa do Dashboard incompleta: {required} ausente."
            )
else:
    errors.append("Migration canônica de resolução de empresa do Dashboard não encontrada.")

if auth_service.exists():
    auth_text = auth_service.read_text(encoding="utf-8")
    if "Falha ao autenticar no Supabase" in auth_text:
        errors.append(
            "Mensagem técnica de Supabase voltou ao fluxo de login Android."
        )

cadastro_workflow = (
    ANDROID
    / "app/src/main/java/br/com/vendamais/mobile/data/remote/CadastroWorkflowRepository.kt"
)
if cadastro_workflow.exists():
    workflow_text = cadastro_workflow.read_text(encoding="utf-8")
    if "syncCadastroAfterSendSafely(session, cadastroId, payload, response, true)" in workflow_text:
        errors.append(
            "Android voltou a finalizar cadastro localmente após sucesso do ERP; "
            "erp-novo-usuario2 deve ser a autoridade canônica."
        )

web_queue = ROOT / "src/pages/FilaUploadERP.tsx"
if web_queue.exists():
    web_queue_text = web_queue.read_text(encoding="utf-8")
    for required in (
        "get_erp_upload_queue_health_v1",
        "requeue_erp_upload_v1",
        "reset_stuck_queue_items_v2",
    ):
        if required not in web_queue_text:
            errors.append(f"Fila ERP Web não usa operação canônica: {required}")

if dashboard_repository.exists():
    repository_text = dashboard_repository.read_text(encoding="utf-8")
    for required in (
        "get_erp_upload_queue_health_v1",
        "requeue_erp_upload_v1",
        "reset_stuck_queue_items_v2",
    ):
        if required not in repository_text:
            errors.append(f"Fila ERP Android não usa operação canônica: {required}")

erp_finalize = ROOT / "supabase/functions/erp-novo-usuario2/index.ts"
if erp_finalize.exists():
    finalize_text = erp_finalize.read_text(encoding="utf-8")
    for required in (
        "canonicalSync",
        "attachmentQueue",
        "empresa_nome",
        "vendedor_codigo",
        "erp_upload_queue",
    ):
        if required not in finalize_text:
            errors.append(f"Finalização canônica ERP incompleta: {required} ausente.")
else:
    errors.append("Edge Function erp-novo-usuario2 não encontrada.")

queue_worker = ROOT / "supabase/functions/erp-process-upload-queue/index.ts"
if queue_worker.exists():
    worker_text = queue_worker.read_text(encoding="utf-8")
    for required in (
        "claim_erp_upload_queue_v4",
        "X-Queue-Worker-Token",
        "processing_token",
        "ERP_REJECTED",
        "FILE_NOT_FOUND",
        "FILE_TOO_LARGE",
        "erpCode === 1",
        "last_error_code",
    ):
        if required not in worker_text:
            errors.append(f"Worker canônico da fila ERP incompleto: {required} ausente.")
else:
    errors.append("Edge Function erp-process-upload-queue não encontrada.")

supabase_config = ROOT / "supabase/config.toml"
if not supabase_config.exists():
    errors.append("supabase/config.toml ausente; worker do cron voltaria a exigir JWT no gateway.")
else:
    config_text = supabase_config.read_text(encoding="utf-8")
    if "[functions.erp-process-upload-queue]" not in config_text or "verify_jwt = false" not in config_text:
        errors.append(
            "erp-process-upload-queue precisa de verify_jwt=false para aceitar X-Queue-Worker-Token do pg_cron."
        )

queue_delivery_migration = (
    ROOT / "supabase/migrations/20260930191500_fix_erp_upload_worker_delivery.sql"
)
if not queue_delivery_migration.exists():
    errors.append("Migration definitiva da fila ERP não encontrada.")
else:
    migration_text = queue_delivery_migration.read_text(encoding="utf-8")
    for required in (
        "ALTER COLUMN next_attempt_at DROP NOT NULL",
        "processing_token",
        "processing_started_at",
        "claim_erp_upload_queue_v4",
        "process_erp_upload_queue_v4",
        "timeout_milliseconds := 600000",
    ):
        if required not in migration_text:
            errors.append(f"Migration definitiva da fila ERP incompleta: {required} ausente.")

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
