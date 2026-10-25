package io.github.finnik723.terma.worker;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import static org.junit.jupiter.api.Assertions.*;

class WorkerContextTest {
    @Test void contextStartsWithoutExternalServicesAndCloses() {
        var context = SpringApplication.run(WorkerApplication.class);
        try {
            assertTrue(context.isActive());
            assertEquals("none", context.getEnvironment().getProperty("spring.main.web-application-type"));
        } finally {
            context.close();
        }
        assertFalse(context.isActive());
    }
}
