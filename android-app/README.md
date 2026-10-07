# Venda+ Mobile — Android + iOS

Workspace mobile do Adesart/Venda+.

O produto possui tres clientes que devem permanecer em paridade por padrao:

- Web: `../src/`
- Android: `app/`
- iOS: `iosApp/`
- Codigo compartilhado: `shared/`

O backend continua canonico no Supabase. Nao existe backend exclusivo para Android ou iOS.

## Android

O Android permanece nativo em Kotlin + Jetpack Compose, com os fluxos existentes preservados.

Build de teste:

```powershell
cd android-app
.\gradlew.bat assembleStandardDebug
```

Release APK + AAB:

```powershell
cd android-app
.\gradlew.bat renameReleaseApk renameReleaseBundle
```

Os artefatos ficam em:

`android-app/app/build/outputs/release-artifacts/`

## Shared Kotlin Multiplatform

O modulo `shared/` fornece a fundacao Kotlin Multiplatform/Compose Multiplatform utilizada pelo iOS e preparada para receber regras e telas compartilhadas gradualmente.

Targets configurados:

- Android
- iOS device arm64
- iOS Simulator arm64
- iOS Simulator x64

A camada compartilhada ja inclui:

- configuracao canonica do Venda+;
- cliente HTTP Ktor multiplataforma;
- gateway Supabase comum;
- shell Compose Multiplatform;
- WebView de paridade para disponibilizar imediatamente o produto completo no iOS sem duplicar regras.

## iOS

O host Xcode esta em:

`android-app/iosApp/VendaMaisIOS.xcodeproj`

Requisitos para compilar/instalar:

- macOS;
- Xcode;
- JDK 17+;
- Apple Developer Team para dispositivo fisico/TestFlight/App Store.

Antes de abrir o Xcode, sincronize a versao:

```bash
cd android-app
./gradlew syncIosVersion
open iosApp/VendaMaisIOS.xcodeproj
```

No primeiro uso em um Mac, selecione o seu Development Team no target `VendaMaisIOS`.

Para detalhes de release consulte `IOS_RELEASE.md`.

## Paridade

Por regra do projeto, mudancas funcionais devem ser avaliadas em Web + Android + iOS, salvo instrucao explicita em contrario. Consulte o `AGENTS.md` da raiz.
