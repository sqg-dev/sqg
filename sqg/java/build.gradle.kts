plugins {
    java
    `jvm-test-suite`
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(libs.guava)
    implementation(libs.duckdb)
    implementation(libs.postgresql)
    implementation(libs.arrowVector)
    implementation(libs.arrowCData)
    runtimeOnly(libs.arrowMemory)
    runtimeOnly("org.slf4j:slf4j-simple:2.0.7")
    runtimeOnly("io.netty:netty-buffer:4.2.7.Final")
    runtimeOnly("com.google.flatbuffers:flatbuffers-java:25.2.10")

    testImplementation(libs.assertj)
    testImplementation(libs.junit)
    testImplementation(libs.testcontainersPostgresql)
    testImplementation(libs.testcontainersJunit)
}

testing {
    suites {
        val test by getting(JvmTestSuite::class) {
            useJUnitJupiter()
        }
    }
}
tasks.test {
    jvmArgs = listOf("--add-opens=java.base/java.nio=org.apache.arrow.memory.core,ALL-UNNAMED")
}
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}
