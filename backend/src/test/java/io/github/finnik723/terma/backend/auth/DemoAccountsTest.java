package io.github.finnik723.terma.backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class DemoAccountsTest {
    @Test void missingShortAndOverlongPasswordsFailWithoutEchoingInput() {
        for (String value : new String[]{"", "too-short", "я".repeat(37)}) {
            var env = new MockEnvironment().withProperty("TERMA_DEMO_PASSWORD_1", value);
            var error = assertThrows(IllegalArgumentException.class, () -> DemoAccounts.password(env, "TERMA_DEMO_PASSWORD_1"));
            if (!value.isEmpty()) assertFalse(error.getMessage().contains(value));
        }
        assertThrows(IllegalArgumentException.class, () -> DemoAccounts.password(new MockEnvironment(), "TERMA_DEMO_PASSWORD_1"));
    }
}
