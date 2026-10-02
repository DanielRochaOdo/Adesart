import java.util.Properties

plugins {
    id("com.android.application") version "8.11.1" apply false
    id("com.android.library") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.multiplatform") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
    id("org.jetbrains.compose") version "1.7.3" apply false
}

tasks.register("syncIosVersion") {
    group = "versioning"
    description = "Sincroniza MARKETING_VERSION/CURRENT_PROJECT_VERSION do iOS com version.properties."

    val source = rootProject.file("version.properties")
    val output = rootProject.file("iosApp/Configuration/Version.xcconfig")

    inputs.file(source)
    outputs.file(output)

    doLast {
        val properties = Properties().apply {
            source.inputStream().use(::load)
        }
        val versionName = properties.getProperty("VERSION_NAME")?.trim().orEmpty().ifBlank { "1.0.0" }
        val versionCode = properties.getProperty("VERSION_CODE")?.trim().orEmpty().ifBlank { "1" }

        output.parentFile.mkdirs()
        output.writeText(
            buildString {
                appendLine("// Gerado por :syncIosVersion. Nao editar manualmente.")
                appendLine("MARKETING_VERSION = " + versionName)
                appendLine("CURRENT_PROJECT_VERSION = " + versionCode)
            },
        )
        println("iOS version sincronizada: " + versionName + " (" + versionCode + ")")
    }
}
