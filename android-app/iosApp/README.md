# Venda+ iOS

Host iOS do Venda+.

A camada visual inicial usa Compose Multiplatform e um WebView nativo iOS para entregar imediatamente a mesma aplicacao canonica do Web dentro do app. O modulo `shared/` tambem contem a fundacao Ktor/Supabase para a migracao progressiva de fluxos para implementacoes nativas compartilhadas.

## Primeiro build em um Mac

```bash
cd android-app
chmod +x gradlew
./gradlew syncIosVersion
open iosApp/VendaMaisIOS.xcodeproj
```

No Xcode selecione o target `VendaMaisIOS`, escolha o Apple Development Team e execute em simulador ou iPhone.

O projeto exige iOS 15 ou superior.

O Xcode executa automaticamente `./gradlew :shared:embedAndSignAppleFrameworkForXcode`.

A fonte de versao e `android-app/version.properties`. Rode `./gradlew syncIosVersion` antes do build iOS.
