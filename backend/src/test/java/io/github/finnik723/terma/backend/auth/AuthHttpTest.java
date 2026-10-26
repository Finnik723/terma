package io.github.finnik723.terma.backend.auth;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

/** Real HTTP/filter/session checks; only the account store is substituted, never shipped. */
@SpringBootTest(classes = AuthHttpTest.HttpOnly.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthHttpTest {
    private static final String PASSWORD = UUID.randomUUID().toString();
    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    @Import({SecurityConfiguration.class, AuthController.class})
    static class HttpOnly {
        @Bean UserDetailsService users(PasswordEncoder encoder) {
            return new InMemoryUserDetailsManager(
                User.withUsername("demo1").password(encoder.encode(PASSWORD)).roles("USER").build(),
                User.withUsername("disabled").password(encoder.encode(PASSWORD)).roles("USER").disabled(true).build());
        }
    }
    @LocalServerPort int port;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    private HttpResponse<String> request(String path, String body, String csrf) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (csrf != null) builder.header("X-CSRF-TOKEN", csrf);
        if (body == null) builder.GET();
        else builder.header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    private String csrf() throws Exception {
        var response = request("/api/auth/csrf", null, null);
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Cache-Control").orElseThrow().contains("no-store"));
        return JsonMapper.builder().build().readTree(response.body()).get("token").asString();
    }
    private String sessionId() {
        return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("JSESSIONID")).findFirst().orElseThrow().getValue();
    }
    private String loginBody(String name, String password) {
        return "username=" + name + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8);
    }

    @Test void sessionLifecycleRotatesIdAndTokenAndInvalidatesOldCookie() throws Exception {
        assertEquals(401, request("/api/auth/session", null, null).statusCode());
        var tokenResponse = request("/api/auth/csrf", null, null);
        String cookie = tokenResponse.headers().firstValue("Set-Cookie").orElseThrow();
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("SameSite=Lax"));
        String before = sessionId();
        String token = csrf();
        assertEquals(204, request("/api/auth/login", loginBody("demo1", PASSWORD), token).statusCode());
        assertNotEquals(before, sessionId());
        var session = request("/api/auth/session", null, null);
        assertEquals(200, session.statusCode());
        assertEquals("{\"username\":\"demo1\"}", session.body());
        assertEquals(404, request("/api/auth/logout", null, null).statusCode());
        assertEquals(200, request("/api/auth/session", null, null).statusCode());
        assertEquals(403, request("/api/auth/logout", "", token).statusCode());
        assertEquals(403, request("/api/auth/logout", "", null).statusCode());
        String authenticatedId = sessionId();
        assertEquals(204, request("/api/auth/logout", "", csrf()).statusCode());
        assertEquals(401, request("/api/auth/session", null, null).statusCode());
        var oldCookie = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/session"))
            .header("Cookie", "JSESSIONID=" + authenticatedId).GET().build();
        assertEquals(401, HttpClient.newHttpClient().send(oldCookie, HttpResponse.BodyHandlers.ofString()).statusCode());
        assertEquals(204, request("/api/auth/login", loginBody("demo1", PASSWORD), csrf()).statusCode());
    }

    @Test void invalidCredentialsAndCsrfNeverAuthenticate() throws Exception {
        assertEquals(403, request("/api/auth/login", loginBody("demo1", PASSWORD), null).statusCode());
        assertEquals(403, request("/api/auth/login", loginBody("demo1", PASSWORD), "invalid").statusCode());
        for (String name : new String[]{"demo1", "unknown", "disabled", "' OR 1=1 --"}) {
            assertEquals(401, request("/api/auth/login", loginBody(name, name.equals("disabled") ? PASSWORD : "wrong"), csrf()).statusCode());
            assertEquals(401, request("/api/auth/session", null, null).statusCode());
        }
        assertEquals(403, request("/api/projects", "{}", null).statusCode());
        assertEquals(401, request("/api/projects", "{}", csrf()).statusCode());
        assertEquals(401, request("/api/auth/login", loginBody("demo1", "я".repeat(100)), csrf()).statusCode());
    }
}
