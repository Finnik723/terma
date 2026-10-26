package io.github.finnik723.terma.worker;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import static org.junit.jupiter.api.Assertions.*;

class WorkerContextTest {
    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    static class IsolatedBootstrap {}

    @Test void contextStartsWithoutExternalServicesAndCloses() {
        var context = SpringApplication.run(IsolatedBootstrap.class);
        try {
            assertTrue(context.isActive());
            assertEquals("none", context.getEnvironment().getProperty("spring.main.web-application-type"));
        } finally {
            context.close();
        }
        assertFalse(context.isActive());
    }
}
