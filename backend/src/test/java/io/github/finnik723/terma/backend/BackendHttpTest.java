package io.github.finnik723.terma.backend;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import static org.junit.jupiter.api.Assertions.*;

// Isolated HTTP check. Real application startup with storage is exercised by PostgreSQL CI.
@SpringBootTest(classes = BackendHttpTest.HttpOnly.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackendHttpTest {
    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    static class HttpOnly {}
    @LocalServerPort int port;

    private HttpResponse<String> get(String path) throws Exception {
        return HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    }

    @Test void livenessIsAnActualHttpResponse() throws Exception {
        var response = get("/actuator/health/liveness");
        assertEquals(200, response.statusCode());
        assertEquals("{\"status\":\"UP\"}", response.body());
    }

    @Test void scaffoldDoesNotExposeDomainOrEnvironmentEndpoints() throws Exception {
        assertEquals(404, get("/api/projects").statusCode());
        assertEquals(404, get("/actuator/env").statusCode());
    }
}
