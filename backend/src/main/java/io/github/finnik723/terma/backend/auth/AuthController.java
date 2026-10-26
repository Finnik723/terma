package io.github.finnik723.terma.backend.auth;

import java.security.Principal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    public record Session(String username) {}
    public record Token(String headerName, String token) {}

    @GetMapping("/api/auth/session") Session session(Principal principal) {
        return new Session(principal.getName());
    }

    @GetMapping("/api/auth/csrf") Token csrf(CsrfToken csrf) {
        return new Token(csrf.getHeaderName(), csrf.getToken());
    }
}
