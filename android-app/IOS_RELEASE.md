# Release iOS — Venda+

## Pre-requisitos externos

Para instalar em iPhone fisico e distribuir via TestFlight/App Store e necessario:

- um Mac com Xcode;
- acesso ao Apple Developer Program da organizacao;
- Development Team configurado no Xcode;
- certificados/profiles administrados pela Apple;
- cadastro do app no App Store Connect.

Esses itens nao ficam no repositorio.

## Preparacao

```bash
cd android-app
./gradlew syncIosVersion
./gradlew :shared:linkReleaseFrameworkIosArm64
open iosApp/VendaMaisIOS.xcodeproj
```

Confirme no Xcode o Bundle Identifier, Team, versao/build, permissoes e o icone final 1024x1024 antes da publicacao.

## Archive

No Xcode use `Product > Archive` e o Organizer para validar e distribuir para TestFlight/App Store Connect.

## Regra de versao

`version.properties` e a fonte canonica da versao mobile. Antes do Archive iOS, rode `:syncIosVersion`.

O iOS nao instala APK. Atualizacoes iOS devem passar por TestFlight/App Store ou outro canal Apple corporativo autorizado.
