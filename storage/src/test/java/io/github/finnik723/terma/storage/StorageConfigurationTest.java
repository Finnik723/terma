package io.github.finnik723.terma.storage;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class StorageConfigurationTest {
    private MockEnvironment settings() {
        return new MockEnvironment().withProperty("spring.datasource.url", "jdbc:postgresql://localhost:5432/example")
                .withProperty("spring.datasource.username", "example").withProperty("spring.datasource.password", "test-only");
    }

    @Test void requiresEveryConnectionSettingWithoutConnecting() {
        for (String key : new String[]{"spring.datasource.url", "spring.datasource.username", "spring.datasource.password"}) {
            var environment = settings();
            environment.setProperty(key, " ");
            var failure = assertThrows(IllegalArgumentException.class, () -> StorageConfiguration.configuration(environment));
            assertTrue(failure.getMessage().contains(key));
            assertFalse(failure.getMessage().contains("test-only"));
        }
    }

    @Test void rejectsCredentialsInUrlWithoutEchoingThemOrUsingAnotherDatabase() {
        for (String url : new String[]{"jdbc:h2:mem:example", "jdbc:postgresql:example",
                "jdbc:postgresql://localhost/example?user=secret-user", "jdbc:postgresql://localhost/example?password=secret-pass"}) {
            var failure = assertThrows(IllegalArgumentException.class,
                    () -> StorageConfiguration.configuration(settings().withProperty("spring.datasource.url", url)));
            assertFalse(failure.getMessage().contains("secret-"));
            assertFalse(failure.getMessage().contains(url));
        }
    }

    @Test void hasFiniteConnectionTimeoutsAndNoEmbeddedFallback() {
        var configuration = StorageConfiguration.configuration(settings());
        assertEquals("jdbc:postgresql://localhost:5432/example", configuration.getJdbcUrl());
        assertEquals(10_000, configuration.getConnectionTimeout());
        assertEquals("10", configuration.getDataSourceProperties().getProperty("socketTimeout"));
        assertEquals("10", configuration.getDataSourceProperties().getProperty("connectTimeout"));
    }
}
